import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, eq, inArray, sql } from "drizzle-orm"
import { artists, punchlines, songs } from "@workspace/db"

import { db } from "./db"
import { requireAdmin } from "./auth"
import { hiddenDailyIds } from "./daily-pool"
import { CLIP_MANIFEST } from "./clip-manifest"

/**
 * Data for the slideshow clip engine (PUN-180/178). Serves ONE reviewed, active,
 * non-daily bar plus its three real artist choices (correct + the two stored
 * distractors), shuffled, with images.
 *
 * GUARDRAIL: only `reviewed = true` bars are ever served — clips are public
 * "Wer hat's gesagt?" content, so a wrong-artist (unreviewed) bar would broadcast
 * a publicly wrong answer. The unreviewed/quarantined bars are never eligible.
 */

export type SlideBar = {
  punchlineId: number
  line: string
  choices: Array<{ id: number; name: string; imageUrl: string | null }>
  correctId: number
  correctName: string
  correctImageUrl: string | null
}

/** A manifest clip = a verified bar + the AI-authored caption/hooks (PUN-178). */
export type ClipBar = {
  bar: SlideBar
  caption: string
  hooks: { hook: string; tension: string; flex: string }
  index: number
  total: number
}

function shuffle<T>(arr: Array<T>): Array<T> {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const reviewedWhere = and(
  eq(punchlines.active, true),
  eq(punchlines.reviewed, true),
  sql`${punchlines.id} NOT IN ${hiddenDailyIds()}`,
)

/** Fetch one reviewed bar + its 3 shuffled artist choices, or null if not eligible. */
async function fetchSlideBar(barId: number): Promise<SlideBar | null> {
  const [bar] = await db
    .select({
      punchlineId: punchlines.id,
      line: punchlines.line,
      artistId: songs.artistId,
      distractor1Id: punchlines.distractor1Id,
      distractor2Id: punchlines.distractor2Id,
    })
    .from(punchlines)
    .innerJoin(songs, eq(songs.id, punchlines.songId))
    .where(and(reviewedWhere, eq(punchlines.id, barId)))
    .limit(1)
  if (!bar) return null

  const ids = [bar.artistId, bar.distractor1Id, bar.distractor2Id]
  const rows = await db
    .select({ id: artists.id, name: artists.name, imageUrl: artists.imageUrl })
    .from(artists)
    .where(inArray(artists.id, ids))
  const byId = new Map(rows.map((a) => [a.id, a]))
  const correct = byId.get(bar.artistId)
  if (!correct) return null

  const choices = shuffle(
    ids
      .map((id) => byId.get(id))
      .filter((a): a is { id: number; name: string; imageUrl: string | null } => Boolean(a)),
  )

  return {
    punchlineId: bar.punchlineId,
    line: bar.line,
    choices,
    correctId: correct.id,
    correctName: correct.name,
    correctImageUrl: correct.imageUrl,
  }
}

/** Random (or specific) verified bar — used for the "explore" / fallback mode. */
export const getSlideBarFn = createServerFn({ method: "GET" })
  .inputValidator((d: { barId?: number | null }) => ({
    barId: typeof d?.barId === "number" && Number.isFinite(d.barId) ? d.barId : null,
  }))
  .handler(async ({ data }): Promise<SlideBar | null> => {
    await requireAdmin(getRequest())
    if (data.barId != null) return fetchSlideBar(data.barId)
    const [pick] = await db
      .select({ id: punchlines.id })
      .from(punchlines)
      .where(reviewedWhere)
      .orderBy(sql`random()`)
      .limit(1)
    if (!pick) return null
    return fetchSlideBar(pick.id)
  })

/** Manifest-driven clip (PUN-178): a verified bar + its authored caption/hooks. */
export const getClipFn = createServerFn({ method: "GET" })
  .inputValidator((d: { index?: number | null }) => ({
    index: typeof d?.index === "number" && Number.isFinite(d.index) ? Math.floor(d.index) : 0,
  }))
  .handler(async ({ data }): Promise<ClipBar | null> => {
    await requireAdmin(getRequest())
    const total = CLIP_MANIFEST.length
    if (total === 0) return null
    // Wrap so "next clip" loops the batch.
    const index = ((data.index % total) + total) % total
    const entry = CLIP_MANIFEST[index]
    const bar = await fetchSlideBar(entry.barId)
    if (!bar) return null
    return { bar, caption: entry.caption, hooks: entry.hooks, index, total }
  })
