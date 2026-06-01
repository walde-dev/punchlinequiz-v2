import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { desc, eq } from "drizzle-orm"
import { artists, punchlines, punchlineSubmissions, songs } from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import { ensureUser } from "./xp"

/**
 * UGC submissions (PUN-14/16). submitBarFn writes a pending row (line required,
 * everything else optional free-text — the admin completes it at review).
 * getMySubmissionsFn powers the owner-only "My submissions" profile section.
 */

export type SubmitBarInput = {
  line: string
  artistHint?: string
  songHint?: string
  answer?: string
  clozePrompt?: string
  note?: string
}

function clean(s: string | undefined, max: number): string | null {
  const v = (s ?? "").trim()
  return v ? v.slice(0, max) : null
}

async function callerClerkId(): Promise<string | null> {
  const result = await getActor(getRequest())
  return result?.actor.kind === "clerk" ? result.actor.userId : null
}

export const submitBarFn = createServerFn({ method: "POST" })
  .inputValidator((d: SubmitBarInput) => d)
  .handler(async ({ data }): Promise<{ ok: true; id: number } | { ok: false; reason: string }> => {
    const clerkId = await callerClerkId()
    if (!clerkId) return { ok: false, reason: "unauthorized" }

    const line = (data.line ?? "").trim()
    if (line.length < 3) return { ok: false, reason: "line_required" }

    await ensureUser(clerkId)
    const answer = clean(data.answer, 200)
    const [row] = await db
      .insert(punchlineSubmissions)
      .values({
        submitterClerkId: clerkId,
        line: line.slice(0, 1000),
        clozePrompt: clean(data.clozePrompt, 1000),
        perfectSolution: answer ? [answer] : null,
        artistHint: clean(data.artistHint, 200),
        songHint: clean(data.songHint, 300),
        note: clean(data.note, 500),
      })
      .returning({ id: punchlineSubmissions.id })
    return { ok: true, id: row.id }
  })

export type MySubmission = {
  id: number
  line: string
  status: string
  createdAt: string
  /** Slug of the minted bar's artist (approved only) — links into play. */
  artistSlug: string | null
}

export const getMySubmissionsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MySubmission[]> => {
    const clerkId = await callerClerkId()
    if (!clerkId) return []
    const rows = await db
      .select({
        id: punchlineSubmissions.id,
        line: punchlineSubmissions.line,
        status: punchlineSubmissions.status,
        createdAt: punchlineSubmissions.createdAt,
        artistSlug: artists.slug,
      })
      .from(punchlineSubmissions)
      .leftJoin(punchlines, eq(punchlines.id, punchlineSubmissions.createdPunchlineId))
      .leftJoin(songs, eq(songs.id, punchlines.songId))
      .leftJoin(artists, eq(artists.id, songs.artistId))
      .where(eq(punchlineSubmissions.submitterClerkId, clerkId))
      .orderBy(desc(punchlineSubmissions.createdAt))
      .limit(50)
    return rows.map((r) => ({
      id: r.id,
      line: r.line,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      artistSlug: r.artistSlug ?? null,
    }))
  },
)
