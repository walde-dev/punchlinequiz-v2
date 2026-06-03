import { createServerFn } from "@tanstack/react-start"
import { and, eq, sql } from "drizzle-orm"
import { anonXp, anonXpClaims, users } from "@workspace/db"

import { db } from "./db"
import { getServerSessionId } from "./log"
import { loadXpConfig } from "./xp"

/**
 * Provisional XP for anonymous players (PUN-97/98).
 *
 * Anonymous correct answers accrue the XP a signed-in user would have earned,
 * keyed by the `pq_sid` session. On sign-up the session total is migrated to
 * the new account ("keep your XP"). Two anti-abuse guards:
 *   1. unique (session_id, punchline_id) — a bar can be banked once per device,
 *      so replaying the same bar can't farm XP (mirrors user_punchline_xp).
 *   2. a hard claim cap — no matter how many distinct bars a device banks, only
 *      CAP is ever migrated, so a script can't grind unbounded XP before
 *      signing up. Roughly one strong session's worth.
 *
 * Server-authoritative: the client never sends an XP number — the server
 * derives it from xp_config, exactly like the signed-in grant path. Anonymous
 * accrual deliberately omits streak bonuses (no anon streak state to maintain).
 */
export const ANON_XP_CLAIM_CAP = 2000

/** Bank the primary correct-answer XP for an anon session. Idempotent per bar. */
export async function accrueAnonPrimary(input: {
  sessionId: string
  punchlineId: number
  mode: "artist" | "cloze"
}): Promise<void> {
  const { sessionId, punchlineId, mode } = input
  if (!sessionId) return
  const cfg = await loadXpConfig()
  const base = mode === "cloze" ? cfg.xpClozeCorrect : cfg.xpArtistCorrect
  // unique (session_id, punchline_id) → replaying a banked bar is a no-op.
  await db
    .insert(anonXp)
    .values({ sessionId, punchlineId, primaryMode: mode, xpAwarded: base })
    .onConflictDoNothing()
}

/** Layer the song bonus onto an existing anon primary row. Idempotent. */
export async function accrueAnonSongBonus(input: {
  sessionId: string
  punchlineId: number
}): Promise<void> {
  const { sessionId, punchlineId } = input
  if (!sessionId) return
  const cfg = await loadXpConfig()
  // Conditional WHERE (song_bonus_awarded = false) prevents double-credit; the
  // primary row only exists if the artist/cloze step was already correct.
  await db
    .update(anonXp)
    .set({
      songBonusAwarded: true,
      xpAwarded: sql`${anonXp.xpAwarded} + ${cfg.xpSongBonus}`,
    })
    .where(
      and(
        eq(anonXp.sessionId, sessionId),
        eq(anonXp.punchlineId, punchlineId),
        eq(anonXp.songBonusAwarded, false),
      ),
    )
}

/** Sum a session's provisional XP, capped. */
async function sumAnonXp(sessionId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${anonXp.xpAwarded}), 0)::int` })
    .from(anonXp)
    .where(eq(anonXp.sessionId, sessionId))
  return Math.min(row?.total ?? 0, ANON_XP_CLAIM_CAP)
}

/**
 * Migrate a session's provisional XP to a signed-in user, exactly once
 * (PUN-98). The anon_xp_claims PK on session_id is the idempotency guard: a
 * second claim for the same session is a no-op (returns 0). Caller must have
 * ensured the user row exists. Never throws on the "nothing to claim" path.
 */
export async function claimAnonXp(clerkId: string, sessionId: string | null): Promise<number> {
  if (!sessionId) return 0
  const capped = await sumAnonXp(sessionId)
  if (capped <= 0) return 0

  // Claim the session first — onConflictDoNothing means only the first claim
  // for this session credits XP; re-claims (or a different account) no-op.
  const inserted = await db
    .insert(anonXpClaims)
    .values({ sessionId, clerkId, xpClaimed: capped })
    .onConflictDoNothing()
    .returning({ sessionId: anonXpClaims.sessionId })
  if (inserted.length === 0) return 0

  await db
    .update(users)
    .set({ totalXp: sql`${users.totalXp} + ${capped}` })
    .where(eq(users.clerkId, clerkId))
  return capped
}

export type AnonXpTotal = { total: number; claimed: boolean }

/**
 * Live provisional-XP total for the current anon session — drives the
 * "X XP banked" pill (PUN-99) and the session-complete claim CTA (PUN-100).
 * Returns claimed=true (total 0) once the session has been migrated, so the
 * pill disappears after sign-up.
 */
export const getAnonXpTotalFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AnonXpTotal> => {
    const sessionId = getServerSessionId()
    if (!sessionId) return { total: 0, claimed: false }
    const [claim] = await db
      .select({ x: anonXpClaims.xpClaimed })
      .from(anonXpClaims)
      .where(eq(anonXpClaims.sessionId, sessionId))
      .limit(1)
    if (claim) return { total: 0, claimed: true }
    return { total: await sumAnonXp(sessionId), claimed: false }
  },
)
