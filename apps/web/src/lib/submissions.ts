import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { artists, contributorGrants, punchlines, punchlineSubmissions, songs } from "@workspace/db"

import { getActor } from "./auth"
import { checkSubmitGate } from "./contributor"
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

export type SubmitBarResult =
  | { ok: true; id: number }
  | { ok: false; reason: "unauthorized" | "line_required" }
  | { ok: false; reason: "cooldown"; retryAfterSeconds: number }
  | { ok: false; reason: "pending_cap"; cap: number; tier: string }

export const submitBarFn = createServerFn({ method: "POST" })
  .inputValidator((d: SubmitBarInput) => d)
  .handler(async ({ data }): Promise<SubmitBarResult> => {
    const clerkId = await callerClerkId()
    if (!clerkId) return { ok: false, reason: "unauthorized" }

    const line = (data.line ?? "").trim()
    if (line.length < 3) return { ok: false, reason: "line_required" }

    await ensureUser(clerkId)

    // Anti-abuse: 30s burst cooldown + tier-scaled pending-slot cap, with an
    // acceptance-rate gate that drops abusers to a single slot (PUN-66).
    const gate = await checkSubmitGate(clerkId)
    if (!gate.ok) {
      if (gate.reason === "cooldown") {
        return { ok: false, reason: "cooldown", retryAfterSeconds: gate.retryAfterSeconds }
      }
      return { ok: false, reason: "pending_cap", cap: gate.cap, tier: gate.tier }
    }

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
  /** XP granted on acceptance (from the contributor_grants ledger); null if none. */
  xpAwarded: number | null
  /** Approved but the contributor hasn't seen the celebration yet (PUN-70). */
  newlyAccepted: boolean
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
        acceptanceSeenAt: punchlineSubmissions.acceptanceSeenAt,
        artistSlug: artists.slug,
        xpAwarded: contributorGrants.xpAwarded,
      })
      .from(punchlineSubmissions)
      .leftJoin(punchlines, eq(punchlines.id, punchlineSubmissions.createdPunchlineId))
      .leftJoin(songs, eq(songs.id, punchlines.songId))
      .leftJoin(artists, eq(artists.id, songs.artistId))
      .leftJoin(contributorGrants, eq(contributorGrants.submissionId, punchlineSubmissions.id))
      .where(eq(punchlineSubmissions.submitterClerkId, clerkId))
      .orderBy(desc(punchlineSubmissions.createdAt))
      .limit(50)
    return rows.map((r) => ({
      id: r.id,
      line: r.line,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      artistSlug: r.artistSlug ?? null,
      xpAwarded: r.xpAwarded ?? null,
      newlyAccepted: r.status === "approved" && r.acceptanceSeenAt === null,
    }))
  },
)

/**
 * Mark all of the caller's approved-but-unseen submissions as seen, after the
 * client has shown the "your bar is live! +XP" celebration (PUN-70). Idempotent.
 */
export const markAcceptanceSeenFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; marked: number }> => {
    const clerkId = await callerClerkId()
    if (!clerkId) return { ok: true, marked: 0 }
    const updated = await db
      .update(punchlineSubmissions)
      .set({ acceptanceSeenAt: sql`now()` })
      .where(
        and(
          eq(punchlineSubmissions.submitterClerkId, clerkId),
          eq(punchlineSubmissions.status, "approved"),
          isNull(punchlineSubmissions.acceptanceSeenAt),
        ),
      )
      .returning({ id: punchlineSubmissions.id })
    return { ok: true, marked: updated.length }
  },
)
