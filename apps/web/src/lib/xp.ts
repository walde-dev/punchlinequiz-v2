import { and, asc, desc, eq, gt, sql } from "drizzle-orm"
import {
  levels,
  punchlines,
  userDailyXp,
  userPunchlineXp,
  users,
  xpConfig,
} from "@workspace/db"

import { db } from "./db"
import { confirmReferralOnActivation } from "./referral"
import { isStreakAlive, streakBonus } from "./scoring"
import type { Level, XpConfig } from "@workspace/db"

export type GrantMode = "artist" | "cloze" | "song_bonus"

export type LevelInfo = {
  id: number
  /**
   * 1-indexed rank position in threshold-ascending order — stable across DB
   * row churn (re-seeds, re-orderings). Use this for badge file paths and
   * any "level N of M" UI labels, NOT the DB primary key `id`.
   */
  rank: number
  threshold: number
  nameDe: string
  nameEn: string
  accent: string
}

export type XpGrantResult =
  | {
      awarded: true
      xpAwarded: number
      streak: number
      totalXp: number
      level: LevelInfo
      nextLevel: LevelInfo | null
      leveledUp: boolean
      previousLevel: LevelInfo
    }
  | { awarded: false; skipped: "duplicate" | "rate_limited" | "anonymous" }

/**
 * Load the singleton config row. Cached briefly per process to keep the
 * grant path cheap; admins can wait a few seconds for new values to apply.
 */
let cachedConfig: { value: XpConfig; expires: number } | null = null
const CONFIG_TTL_MS = 5_000
export async function loadXpConfig(): Promise<XpConfig> {
  const now = Date.now()
  if (cachedConfig && cachedConfig.expires > now) return cachedConfig.value
  const [row] = await db
    .select()
    .from(xpConfig)
    .where(eq(xpConfig.id, 1))
    .limit(1)
  if (!row) throw new Error("xp_config row missing — run migrations")
  cachedConfig = { value: row, expires: now + CONFIG_TTL_MS }
  return row
}

let cachedLevels: { value: Array<Level>; expires: number } | null = null
export async function loadLevels(): Promise<Array<Level>> {
  const now = Date.now()
  if (cachedLevels && cachedLevels.expires > now) return cachedLevels.value
  const rows = await db.select().from(levels).orderBy(asc(levels.threshold))
  cachedLevels = { value: rows, expires: now + CONFIG_TTL_MS }
  return rows
}

export function invalidateXpCaches() {
  cachedConfig = null
  cachedLevels = null
}

/** Map every level row to its public LevelInfo, ranked by threshold order. */
export function levelInfos(sorted: Array<Level>): Array<LevelInfo> {
  return sorted.map((l, i) => toLevelInfo(l, i + 1))
}

export function levelFor(
  totalXp: number,
  sorted: Array<Level>
): { current: LevelInfo; next: LevelInfo | null } {
  let currentIdx = 0
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].threshold <= totalXp) currentIdx = i
    else break
  }
  const nextIdx = sorted.findIndex((l) => l.threshold > totalXp)
  return {
    current: toLevelInfo(sorted[currentIdx], currentIdx + 1),
    next: nextIdx >= 0 ? toLevelInfo(sorted[nextIdx], nextIdx + 1) : null,
  }
}

// rankIconPath() moved to ./rank-icon.ts so client components can use it
// without pulling this server-only module (and db) into the client bundle.
export { rankIconPath } from "./rank-icon"

function toLevelInfo(l: Level, rank: number): LevelInfo {
  return {
    id: l.id,
    rank,
    threshold: l.threshold,
    nameDe: l.nameDe,
    nameEn: l.nameEn,
    accent: l.accent,
  }
}

/**
 * Idempotent upsert of a Clerk user. Called as the first step of every grant
 * path so anonymous → signed-in transitions don't 404.
 */
export async function ensureUser(clerkId: string): Promise<void> {
  await db
    .insert(users)
    .values({ clerkId, totalXp: 0, currentStreak: 0, longestStreak: 0 })
    .onConflictDoNothing()
}

// `isStreakAlive` / `streakBonus` moved to ./scoring (pure, unit-tested).

/**
 * Award XP for a correct primary answer (artist or cloze mode). Idempotent
 * via the (clerk_id, punchline_id) unique index — replaying a solved bar
 * is a no-op.
 *
 * Anti-abuse:
 * - Rate limit: every server-validated submit (right or wrong) updates
 *   users.last_attempt_at via the caller before this runs. We refuse to
 *   grant if the previous attempt is closer than minSecondsBetweenAttempts.
 * - Duplicate enforced by unique index.
 * - Anonymous callers never reach here (caller checks).
 *
 * Race notes (neon-http has no row locking): the unique index guarantees no
 * double-grant. The users-row update is purely additive math via SQL, so
 * concurrent grants for *different* punchlines add their xp correctly. Only
 * the streak counter (last-writer-wins) can be off by ±1 under simultaneous
 * grants for the same user — not exploitable.
 */
export async function grantPrimary(input: {
  clerkId: string
  punchlineId: number
  mode: "artist" | "cloze"
}): Promise<XpGrantResult> {
  const { clerkId, punchlineId, mode } = input

  await ensureUser(clerkId)
  const cfg = await loadXpConfig()
  const sortedLevels = await loadLevels()

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1)
  if (!userRow) throw new Error("user upsert failed")

  // Cooldown — block autofarm. Update last_attempt_at unconditionally so a
  // burst of attempts can't slip past by all reading a stale timestamp.
  if (
    userRow.lastAttemptAt &&
    Date.now() - userRow.lastAttemptAt.getTime() <
      cfg.minSecondsBetweenAttempts * 1000
  ) {
    await db
      .update(users)
      .set({ lastAttemptAt: new Date() })
      .where(eq(users.clerkId, clerkId))
    return { awarded: false, skipped: "rate_limited" }
  }

  // Compute streak from current state.
  const alive = isStreakAlive(userRow.lastCorrectAt, cfg.streakIdleResetMinutes)
  const newStreak = alive ? userRow.currentStreak + 1 : 1
  const bonus = streakBonus(newStreak, cfg)
  const base = mode === "cloze" ? cfg.xpClozeCorrect : cfg.xpArtistCorrect
  const total = base + bonus

  // Idempotent insert. If the row already exists, this is a duplicate.
  const inserted = await db
    .insert(userPunchlineXp)
    .values({
      clerkId,
      punchlineId,
      primaryMode: mode,
      xpAwarded: total,
      streakAtAward: newStreak,
    })
    .onConflictDoNothing()
    .returning({ id: userPunchlineXp.id })

  if (inserted.length === 0) {
    await db
      .update(users)
      .set({ lastAttemptAt: new Date() })
      .where(eq(users.clerkId, clerkId))
    return { awarded: false, skipped: "duplicate" }
  }

  // Commit user totals atomically via SQL math.
  const now = new Date()
  await db
    .update(users)
    .set({
      totalXp: sql`${users.totalXp} + ${total}`,
      currentStreak: newStreak,
      longestStreak: sql`GREATEST(${users.longestStreak}, ${newStreak})`,
      lastCorrectAt: now,
      lastAttemptAt: now,
    })
    .where(eq(users.clerkId, clerkId))

  // Confirm a pending referral on the referee's first correct answer (PUN-72).
  // No-op (one indexed lookup) once confirmed or for non-referred users.
  await confirmReferralOnActivation(clerkId, cfg).catch(() => {})

  const prev = levelFor(userRow.totalXp, sortedLevels)
  const after = levelFor(userRow.totalXp + total, sortedLevels)

  return {
    awarded: true,
    xpAwarded: total,
    streak: newStreak,
    totalXp: userRow.totalXp + total,
    level: after.current,
    nextLevel: after.next,
    previousLevel: prev.current,
    leveledUp: after.current.rank !== prev.current.rank,
  }
}

/**
 * Award the song-guess bonus on top of an already-graded primary grant.
 * Requires the primary row to exist (server enforces by checking the row).
 * Idempotent via `song_bonus_awarded` flag: a second correct song guess on
 * the same bar is a no-op.
 */
export async function grantSongBonus(input: {
  clerkId: string
  punchlineId: number
}): Promise<XpGrantResult> {
  const { clerkId, punchlineId } = input
  await ensureUser(clerkId)
  const cfg = await loadXpConfig()
  const sortedLevels = await loadLevels()

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1)
  if (!userRow) throw new Error("user upsert failed")

  // Cooldown.
  if (
    userRow.lastAttemptAt &&
    Date.now() - userRow.lastAttemptAt.getTime() <
      cfg.minSecondsBetweenAttempts * 1000
  ) {
    await db
      .update(users)
      .set({ lastAttemptAt: new Date() })
      .where(eq(users.clerkId, clerkId))
    return { awarded: false, skipped: "rate_limited" }
  }

  // Find the primary grant row.
  const [grantRow] = await db
    .select()
    .from(userPunchlineXp)
    .where(
      and(
        eq(userPunchlineXp.clerkId, clerkId),
        eq(userPunchlineXp.punchlineId, punchlineId)
      )
    )
    .limit(1)

  if (!grantRow || grantRow.songBonusAwarded) {
    await db
      .update(users)
      .set({ lastAttemptAt: new Date() })
      .where(eq(users.clerkId, clerkId))
    return { awarded: false, skipped: "duplicate" }
  }

  // Update primary row to flag bonus + add xp. Conditional WHERE prevents
  // double-credit on concurrent calls.
  const updated = await db
    .update(userPunchlineXp)
    .set({
      songBonusAwarded: true,
      xpAwarded: sql`${userPunchlineXp.xpAwarded} + ${cfg.xpSongBonus}`,
    })
    .where(
      and(
        eq(userPunchlineXp.clerkId, clerkId),
        eq(userPunchlineXp.punchlineId, punchlineId),
        eq(userPunchlineXp.songBonusAwarded, false)
      )
    )
    .returning({ id: userPunchlineXp.id })

  if (updated.length === 0) {
    await db
      .update(users)
      .set({ lastAttemptAt: new Date() })
      .where(eq(users.clerkId, clerkId))
    return { awarded: false, skipped: "duplicate" }
  }

  const total = cfg.xpSongBonus
  const now = new Date()
  await db
    .update(users)
    .set({
      totalXp: sql`${users.totalXp} + ${total}`,
      lastAttemptAt: now,
    })
    .where(eq(users.clerkId, clerkId))

  const prev = levelFor(userRow.totalXp, sortedLevels)
  const after = levelFor(userRow.totalXp + total, sortedLevels)

  return {
    awarded: true,
    xpAwarded: total,
    streak: userRow.currentStreak,
    totalXp: userRow.totalXp + total,
    level: after.current,
    nextLevel: after.next,
    previousLevel: prev.current,
    leveledUp: after.current.rank !== prev.current.rank,
  }
}

/**
 * Daily artist grant. First call inserts the row; second call for the same
 * date (same user) is a no-op via the unique index. Daily grants do NOT
 * touch user_punchline_xp so the bar stays earnable in /play later.
 */
export async function grantDailyArtist(input: {
  clerkId: string
  date: string
  isCorrect: boolean
  /**
   * Whether the player nailed the artist on their first pick. A retry-correct
   * still counts (streak, success moment) but earns a reduced base. Defaults
   * to true so non-daily callers keep the old full-grant behaviour.
   */
  firstTry?: boolean
}): Promise<XpGrantResult> {
  const { clerkId, date, isCorrect, firstTry = true } = input
  await ensureUser(clerkId)
  const cfg = await loadXpConfig()
  const sortedLevels = await loadLevels()

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1)
  if (!userRow) throw new Error("user upsert failed")

  if (
    userRow.lastAttemptAt &&
    Date.now() - userRow.lastAttemptAt.getTime() <
      cfg.minSecondsBetweenAttempts * 1000
  ) {
    await db
      .update(users)
      .set({ lastAttemptAt: new Date() })
      .where(eq(users.clerkId, clerkId))
    return { awarded: false, skipped: "rate_limited" }
  }

  // Only grant if the answer is correct; a wrong daily artist still records
  // a row so the day is "spent" but with zero xp.
  const alive = isStreakAlive(userRow.lastCorrectAt, cfg.streakIdleResetMinutes)
  const newStreak = isCorrect
    ? alive
      ? userRow.currentStreak + 1
      : 1
    : userRow.currentStreak
  const bonus = isCorrect ? streakBonus(newStreak, cfg) : 0
  // Retry-correct earns half the base; first-try earns full. Streak + bonus
  // still apply either way — they got it, the day counts.
  const base = isCorrect
    ? firstTry
      ? cfg.xpDailyArtist
      : Math.round(cfg.xpDailyArtist / 2)
    : 0
  const total = base + bonus

  const inserted = await db
    .insert(userDailyXp)
    .values({
      clerkId,
      date,
      artistCorrect: isCorrect,
      songCorrect: false,
      songResolved: false,
      xpAwarded: total,
      streakAtAward: newStreak,
    })
    .onConflictDoNothing()
    .returning({ id: userDailyXp.id })

  if (inserted.length === 0) {
    await db
      .update(users)
      .set({ lastAttemptAt: new Date() })
      .where(eq(users.clerkId, clerkId))
    return { awarded: false, skipped: "duplicate" }
  }

  const now = new Date()
  await db
    .update(users)
    .set({
      totalXp: sql`${users.totalXp} + ${total}`,
      currentStreak: newStreak,
      longestStreak: sql`GREATEST(${users.longestStreak}, ${newStreak})`,
      lastCorrectAt: isCorrect ? now : userRow.lastCorrectAt,
      lastAttemptAt: now,
    })
    .where(eq(users.clerkId, clerkId))

  // First correct daily answer also confirms a pending referral (PUN-72).
  if (isCorrect) await confirmReferralOnActivation(clerkId, cfg).catch(() => {})

  const prev = levelFor(userRow.totalXp, sortedLevels)
  const after = levelFor(userRow.totalXp + total, sortedLevels)

  return {
    awarded: true,
    xpAwarded: total,
    streak: newStreak,
    totalXp: userRow.totalXp + total,
    level: after.current,
    nextLevel: after.next,
    previousLevel: prev.current,
    leveledUp: after.current.rank !== prev.current.rank,
  }
}

/**
 * Resolve the daily song step. Updates the existing daily row in place. The
 * `song_resolved` flag is the second idempotency guard (separate from
 * `song_correct` so we distinguish "skipped" from "wrong"). Awards the song
 * xp + the perfect bonus if both artist and song were correct.
 */
export async function grantDailySong(input: {
  clerkId: string
  date: string
  isCorrect: boolean
}): Promise<XpGrantResult> {
  const { clerkId, date, isCorrect } = input
  await ensureUser(clerkId)
  const cfg = await loadXpConfig()
  const sortedLevels = await loadLevels()

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1)
  if (!userRow) throw new Error("user upsert failed")

  const [dailyRow] = await db
    .select()
    .from(userDailyXp)
    .where(and(eq(userDailyXp.clerkId, clerkId), eq(userDailyXp.date, date)))
    .limit(1)

  if (!dailyRow || dailyRow.songResolved) {
    return { awarded: false, skipped: "duplicate" }
  }

  const songXp = isCorrect ? cfg.xpDailySong : 0
  const perfectBonus =
    isCorrect && dailyRow.artistCorrect ? cfg.xpDailyPerfectBonus : 0
  const total = songXp + perfectBonus

  const updated = await db
    .update(userDailyXp)
    .set({
      songCorrect: isCorrect,
      songResolved: true,
      xpAwarded: sql`${userDailyXp.xpAwarded} + ${total}`,
    })
    .where(
      and(
        eq(userDailyXp.clerkId, clerkId),
        eq(userDailyXp.date, date),
        eq(userDailyXp.songResolved, false)
      )
    )
    .returning({ id: userDailyXp.id })

  if (updated.length === 0) return { awarded: false, skipped: "duplicate" }

  if (total > 0) {
    const now = new Date()
    await db
      .update(users)
      .set({
        totalXp: sql`${users.totalXp} + ${total}`,
        lastAttemptAt: now,
      })
      .where(eq(users.clerkId, clerkId))
  }

  const prev = levelFor(userRow.totalXp, sortedLevels)
  const after = levelFor(userRow.totalXp + total, sortedLevels)

  return {
    awarded: true,
    xpAwarded: total,
    streak: userRow.currentStreak,
    totalXp: userRow.totalXp + total,
    level: after.current,
    nextLevel: after.next,
    previousLevel: prev.current,
    leveledUp: after.current.rank !== prev.current.rank,
  }
}

/**
 * Profile snapshot. Loaded by /profile and the header chip. Anonymous users
 * get a soft "not signed in" stub from the route, not this function.
 */
export type ProfileSnapshot = {
  clerkId: string
  totalXp: number
  currentStreak: number
  longestStreak: number
  level: LevelInfo
  nextLevel: LevelInfo | null
  progressInLevel: number
  progressPct: number
  linesConquered: number
  daysCompleted: number
  recent: Array<{
    punchlineId: number
    line: string
    xpAwarded: number
    createdAt: string
  }>
  last30Days: Array<{ date: string; xp: number }>
}

export async function getProfileSnapshot(
  clerkId: string
): Promise<ProfileSnapshot> {
  await ensureUser(clerkId)
  const sortedLevels = await loadLevels()
  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1)
  if (!userRow) throw new Error("user not found")

  const [{ count: linesConquered }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userPunchlineXp)
    .where(eq(userPunchlineXp.clerkId, clerkId))

  const [{ count: daysCompleted }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userDailyXp)
    .where(eq(userDailyXp.clerkId, clerkId))

  const recentRows = await db
    .select({
      punchlineId: userPunchlineXp.punchlineId,
      line: punchlines.line,
      xpAwarded: userPunchlineXp.xpAwarded,
      createdAt: userPunchlineXp.createdAt,
    })
    .from(userPunchlineXp)
    .innerJoin(punchlines, eq(punchlines.id, userPunchlineXp.punchlineId))
    .where(eq(userPunchlineXp.clerkId, clerkId))
    .orderBy(desc(userPunchlineXp.createdAt))
    .limit(10)

  const sparkRows = await db
    .select({
      day: sql<string>`to_char(${userPunchlineXp.createdAt}, 'YYYY-MM-DD')`,
      xp: sql<number>`sum(${userPunchlineXp.xpAwarded})::int`,
    })
    .from(userPunchlineXp)
    .where(
      and(
        eq(userPunchlineXp.clerkId, clerkId),
        gt(userPunchlineXp.createdAt, sql`NOW() - INTERVAL '30 days'`)
      )
    )
    .groupBy(sql`to_char(${userPunchlineXp.createdAt}, 'YYYY-MM-DD')`)

  const { current, next } = levelFor(userRow.totalXp, sortedLevels)
  const progressInLevel = userRow.totalXp - current.threshold
  const progressPct = next
    ? Math.min(
        100,
        Math.max(
          0,
          (progressInLevel / (next.threshold - current.threshold)) * 100
        )
      )
    : 100

  return {
    clerkId,
    totalXp: userRow.totalXp,
    currentStreak: userRow.currentStreak,
    longestStreak: userRow.longestStreak,
    level: current,
    nextLevel: next,
    progressInLevel,
    progressPct,
    linesConquered: linesConquered ?? 0,
    daysCompleted: daysCompleted ?? 0,
    recent: recentRows.map((r) => ({
      punchlineId: r.punchlineId,
      line: r.line,
      xpAwarded: r.xpAwarded,
      createdAt: r.createdAt.toISOString(),
    })),
    last30Days: buildSparkSeries(
      sparkRows.map((r) => ({ date: r.day, xp: Number(r.xp) }))
    ),
  }
}

function buildSparkSeries(
  rows: Array<{ date: string; xp: number }>
): Array<{ date: string; xp: number }> {
  const map = new Map(rows.map((r) => [r.date, r.xp]))
  const out: Array<{ date: string; xp: number }> = []
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    out.push({ date: key, xp: map.get(key) ?? 0 })
  }
  return out
}
