import { eq, sql } from "drizzle-orm"
import { contributorGrants, punchlineSubmissions, users } from "@workspace/db"

import { db } from "./db"
import { ensureUser, loadXpConfig } from "./xp"

/**
 * Contributor reputation + reward logic (PUN-65/66). Tiers are computed on-read
 * from submission counts — no stored column. XP grants are recorded in the
 * contributor_grants ledger (idempotent per submission) and feed users.total_xp.
 *
 * Auto-publish is DEFERRED (a submission carries no mint-ready artist/song/
 * distractor data), so the top tier here only grants review priority + prestige
 * for now — it does not bypass admin review.
 */

export type ContributorTier = "neuling" | "vertraut" | "verifiziert"

/** Ascending ladder. Thresholds are constants (structural, not live-tuned). */
export const TIER_THRESHOLDS = [
  { key: "neuling" as const, minAccepted: 0, minRate: 0 },
  { key: "vertraut" as const, minAccepted: 5, minRate: 0.6 },
  { key: "verifiziert" as const, minAccepted: 25, minRate: 0.8 },
]

/** Outstanding-pending submission cap per tier (anti-abuse throughput valve). */
const PENDING_CAP: Record<ContributorTier, number> = {
  neuling: 5,
  vertraut: 15,
  verifiziert: 100_000, // effectively uncapped
}

/** Acceptance-rate gate: tanking your rate throttles you to a single slot. */
const LOW_RATE_THRESHOLD = 0.3
const LOW_RATE_MIN_RESOLVED = 10
const LOW_RATE_CAP = 1

/** Minimum delay between two submissions from the same user (burst guard). */
export const SUBMIT_COOLDOWN_SECONDS = 30

export type ContributorStats = {
  submitted: number
  accepted: number
  rejected: number
  pending: number
  /** accepted + rejected. */
  resolved: number
  /** accepted / resolved, 0 when nothing is resolved yet. */
  acceptanceRate: number
  tier: ContributorTier
}

/**
 * Compute tier from accepted + resolved counts. The minAccepted thresholds
 * (5 / 25) already guarantee resolved ≥ 5 before the rate gate matters, so the
 * "min 5 resolved" rule is satisfied structurally — a 1/1 = 100% user is still
 * Neuling because accepted (1) < 5.
 */
export function computeTier(accepted: number, resolved: number): ContributorTier {
  const rate = resolved > 0 ? accepted / resolved : 0
  if (accepted >= 25 && rate >= 0.8) return "verifiziert"
  if (accepted >= 5 && rate >= 0.6) return "vertraut"
  return "neuling"
}

function tierFromCounts(accepted: number, rejected: number, pending: number): ContributorStats {
  const resolved = accepted + rejected
  return {
    submitted: accepted + rejected + pending,
    accepted,
    rejected,
    pending,
    resolved,
    acceptanceRate: resolved > 0 ? accepted / resolved : 0,
    tier: computeTier(accepted, resolved),
  }
}

/** Load a contributor's submission counts + derived tier. */
export async function getContributorStats(clerkId: string): Promise<ContributorStats> {
  const rows = await db
    .select({ status: punchlineSubmissions.status, count: sql<number>`count(*)::int` })
    .from(punchlineSubmissions)
    .where(eq(punchlineSubmissions.submitterClerkId, clerkId))
    .groupBy(punchlineSubmissions.status)

  let accepted = 0
  let rejected = 0
  let pending = 0
  for (const r of rows) {
    if (r.status === "approved") accepted = Number(r.count)
    else if (r.status === "rejected") rejected = Number(r.count)
    else pending += Number(r.count)
  }
  return tierFromCounts(accepted, rejected, pending)
}

/** The pending-slot cap that currently applies to this user (rate-gated). */
export function effectivePendingCap(stats: ContributorStats): number {
  if (stats.resolved >= LOW_RATE_MIN_RESOLVED && stats.acceptanceRate < LOW_RATE_THRESHOLD) {
    return LOW_RATE_CAP
  }
  return PENDING_CAP[stats.tier]
}

export type SubmitGate =
  | { ok: true }
  | { ok: false; reason: "cooldown"; retryAfterSeconds: number }
  | { ok: false; reason: "pending_cap"; cap: number; tier: ContributorTier }

/**
 * Decide whether a user may submit right now: a 30s burst cooldown plus the
 * tier-scaled cap on outstanding pending submissions. Read-only — the caller
 * inserts the row only when this returns ok.
 */
export async function checkSubmitGate(clerkId: string): Promise<SubmitGate> {
  // Burst cooldown: most-recent submission within the window blocks.
  const [latest] = await db
    .select({ createdAt: punchlineSubmissions.createdAt })
    .from(punchlineSubmissions)
    .where(eq(punchlineSubmissions.submitterClerkId, clerkId))
    .orderBy(sql`${punchlineSubmissions.createdAt} DESC`)
    .limit(1)
  if (latest) {
    const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000
    if (elapsed < SUBMIT_COOLDOWN_SECONDS) {
      return { ok: false, reason: "cooldown", retryAfterSeconds: Math.ceil(SUBMIT_COOLDOWN_SECONDS - elapsed) }
    }
  }

  const stats = await getContributorStats(clerkId)
  const cap = effectivePendingCap(stats)
  if (stats.pending >= cap) {
    return { ok: false, reason: "pending_cap", cap, tier: stats.tier }
  }
  return { ok: true }
}

export type ContributorGrantResult =
  | { awarded: true; xp: number; prevTier: ContributorTier; newTier: ContributorTier; tierUp: boolean }
  | { awarded: false; skipped: "duplicate" }

/**
 * Grant contributor XP for an accepted submission. MUST be called AFTER the
 * submission row has been flipped to status='approved' (so the counts include
 * this acceptance). Idempotent via the unique submission_id index. Adds to
 * users.total_xp via SQL math → feeds rank + the all-time XP board only.
 */
export async function grantContributorXp(input: {
  submissionId: number
  clerkId: string
}): Promise<ContributorGrantResult> {
  const { submissionId, clerkId } = input
  await ensureUser(clerkId)
  const cfg = await loadXpConfig()
  const xp = cfg.xpSubmissionAccepted

  const inserted = await db
    .insert(contributorGrants)
    .values({ submissionId, clerkId, xpAwarded: xp })
    .onConflictDoNothing()
    .returning({ id: contributorGrants.id })

  if (inserted.length === 0) return { awarded: false, skipped: "duplicate" }

  await db
    .update(users)
    .set({ totalXp: sql`${users.totalXp} + ${xp}` })
    .where(eq(users.clerkId, clerkId))

  // Tier-up detection: this acceptance moved one pending → approved, so both
  // accepted and resolved grew by 1. Compare the tier just before vs just after.
  const stats = await getContributorStats(clerkId)
  const prevTier = computeTier(stats.accepted - 1, stats.resolved - 1)
  const tierUp = prevTier !== stats.tier
  return { awarded: true, xp, prevTier, newTier: stats.tier, tierUp }
}

/**
 * Weekly submission streak (PUN-68/70): consecutive ISO weeks (Mon-anchored,
 * UTC) with ≥1 submission, counting back from the current week. The streak is
 * "alive" only if the most recent active week is this week or last week — a
 * two-week gap resets it to 0.
 */
export async function getSubmissionStreak(clerkId: string): Promise<number> {
  const rows = await db
    .select({ wk: sql<string>`to_char(date_trunc('week', ${punchlineSubmissions.createdAt}), 'YYYY-MM-DD')` })
    .from(punchlineSubmissions)
    .where(eq(punchlineSubmissions.submitterClerkId, clerkId))
    .groupBy(sql`date_trunc('week', ${punchlineSubmissions.createdAt})`)
  const weeks = new Set(rows.map((r) => r.wk))
  if (weeks.size === 0) return 0

  // Monday 00:00 UTC of the current week.
  const now = new Date()
  const cur = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() + 6) % 7))
  const key = (d: Date) => d.toISOString().slice(0, 10)

  // Anchor: this week if active, else last week if active, else dead.
  const lastWeek = new Date(cur)
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7)
  let cursor: Date
  if (weeks.has(key(cur))) cursor = cur
  else if (weeks.has(key(lastWeek))) cursor = lastWeek
  else return 0

  let streak = 0
  while (weeks.has(key(cursor))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 7)
  }
  return streak
}

/**
 * Progress toward the next tier (PUN-70). Returns the next tier + how many more
 * accepted bars are needed, or null when already at the top tier. Note: the
 * acceptance-rate gate also matters, but the accepted-count gap is the legible,
 * actionable number to show ("noch 3 bis Vertraut").
 */
export function nextTierProgress(
  stats: ContributorStats,
): { nextTier: ContributorTier; acceptedNeeded: number } | null {
  if (stats.tier === "verifiziert") return null
  const target = stats.tier === "neuling" ? TIER_THRESHOLDS[1] : TIER_THRESHOLDS[2]
  return {
    nextTier: target.key,
    acceptedNeeded: Math.max(1, target.minAccepted - stats.accepted),
  }
}

export type ContributorProfile = ContributorStats & {
  streak: number
  nextTier: { nextTier: ContributorTier; acceptedNeeded: number } | null
}

/** Profile bundle: counts + tier + weekly submission streak (PUN-68). */
export async function getContributorProfile(clerkId: string): Promise<ContributorProfile> {
  const [stats, streak] = await Promise.all([getContributorStats(clerkId), getSubmissionStreak(clerkId)])
  return { ...stats, streak, nextTier: nextTierProgress(stats) }
}

/** Batch tier lookup for a set of clerk ids (leaderboard / queue ordering). */
export async function getTiersFor(clerkIds: string[]): Promise<Map<string, ContributorTier>> {
  const out = new Map<string, ContributorTier>()
  if (clerkIds.length === 0) return out
  const rows = await db
    .select({
      clerkId: punchlineSubmissions.submitterClerkId,
      accepted: sql<number>`count(*) filter (where ${punchlineSubmissions.status} = 'approved')::int`,
      resolved: sql<number>`count(*) filter (where ${punchlineSubmissions.status} in ('approved','rejected'))::int`,
    })
    .from(punchlineSubmissions)
    .where(
      sql`${punchlineSubmissions.submitterClerkId} in (${sql.join(
        clerkIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .groupBy(punchlineSubmissions.submitterClerkId)
  for (const r of rows) {
    out.set(r.clerkId, computeTier(Number(r.accepted), Number(r.resolved)))
  }
  return out
}
