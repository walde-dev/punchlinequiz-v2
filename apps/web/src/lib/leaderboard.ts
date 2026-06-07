import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm"
import {
  follows,
  punchlineSubmissions,
  punchlines,
  userPunchlineXp,
  users,
} from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import { levelFor, loadLevels } from "./xp"
import type { SQL } from "drizzle-orm"
import type { LevelInfo } from "./xp"

/**
 * Two independent axes (PUN-… leaderboard redesign):
 *  - scope:  global (all onboarded users) | friends (followed set + self)
 *  - metric: punchlines (bars solved) | contributed (approved bars) | rank
 *            (all-time XP — the "league" ladder; tier badge is the hero, XP
 *            shown as a secondary value)
 * The old weekly/all-time window was dropped: every board is all-time. A
 * private weekly-XP helper (weeklyXpTop) survives only for the Discord bot.
 */
export type LeaderboardScope = "global" | "friends"
export type LeaderboardMetric = "punchlines" | "contributed" | "rank"

export type LeaderboardEntry = {
  rank: number
  handle: string
  imageUrl: string | null
  /** All-time XP — drives the rank badge regardless of the active board. */
  totalXp: number
  level: LevelInfo
  /** The ranked value: solved-line count, approved-bar count, or total XP. */
  metric: number
}

export type LeaderboardResult = {
  scope: LeaderboardScope
  metric: LeaderboardMetric
  /** Denominator for the punchlines board (active lines); null otherwise. */
  totalActiveLines: number | null
  top: Array<LeaderboardEntry>
  me: (LeaderboardEntry & { inTop: boolean }) | null
}

const TOP_N = 100

/** Monday 00:00 UTC of the current week — consistent with the app's UTC day math. */
export function currentWeekStartUtc(): Date {
  const now = new Date()
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysSinceMonday)
  return d
}

/**
 * Hypothetical weekly XP rank for a raw XP value (PUN-118). Powers the anon
 * signup offer ("you'd be #X this week") — compares a banked anon total against
 * the live weekly distribution of onboarded users. rank = (# ahead) + 1.
 */
export async function weeklyRankForXp(xp: number): Promise<number> {
  const start = currentWeekStartUtc()
  const rows = await rawRows<{ ahead: number }>(sql`
    WITH wk AS (
      SELECT s.clerk_id, SUM(s.xp)::int AS xp
      FROM (
        SELECT clerk_id, xp_awarded AS xp FROM ${userPunchlineXp} WHERE created_at >= ${start}
        UNION ALL
        SELECT clerk_id, xp_awarded AS xp FROM user_daily_xp WHERE created_at >= ${start}
      ) s
      JOIN ${users} u ON u.clerk_id = s.clerk_id AND u.handle IS NOT NULL
      GROUP BY s.clerk_id
    )
    SELECT count(*)::int AS ahead FROM wk WHERE wk.xp > ${xp}
  `)
  return Number(rows[0]?.ahead ?? 0) + 1
}

/**
 * Weekly XP top list — Discord-only. The UI dropped the weekly window, but the
 * recurring community post wants "who's hot this week", not a static all-time
 * ladder. Returns just what the bot renders (rank/handle/metric).
 */
export async function weeklyXpTop(
  limit = 10
): Promise<Array<{ rank: number; handle: string; metric: number }>> {
  const start = currentWeekStartUtc()
  const rows = await rawRows<Row>(sql`
    SELECT u.clerk_id, u.handle, u.image_url, u.total_xp, COALESCE(SUM(t.xp), 0)::int AS metric
    FROM ${users} u
    JOIN (
      SELECT clerk_id, xp_awarded AS xp FROM ${userPunchlineXp} WHERE created_at >= ${start}
      UNION ALL
      SELECT clerk_id, xp_awarded AS xp FROM user_daily_xp WHERE created_at >= ${start}
    ) t ON t.clerk_id = u.clerk_id
    WHERE u.handle IS NOT NULL
    GROUP BY u.clerk_id, u.handle, u.image_url, u.total_xp
    ORDER BY metric DESC
    LIMIT ${limit}
  `)
  return rows.map((r, i) => ({
    rank: i + 1,
    handle: r.handle,
    metric: Number(r.metric),
  }))
}

async function rawRows<T>(query: SQL): Promise<Array<T>> {
  const res = (await db.execute(query)) as unknown as
    | { rows?: Array<T> }
    | Array<T>
  return Array.isArray(res) ? res : (res.rows ?? [])
}

type Row = {
  clerk_id: string
  handle: string
  image_url: string | null
  total_xp: number
  metric: number
}

function toEntry(
  row: Row,
  rank: number,
  levels: Awaited<ReturnType<typeof loadLevels>>
): LeaderboardEntry {
  return {
    rank,
    handle: row.handle,
    imageUrl: row.image_url,
    totalXp: row.total_xp,
    level: levelFor(row.total_xp, levels).current,
    metric: Number(row.metric),
  }
}

/** Clerk ids the user follows, plus themselves (the friends-scope set). */
async function followedSet(callerId: string): Promise<Array<string>> {
  const rows = await db
    .select({ id: follows.followeeClerkId })
    .from(follows)
    .where(eq(follows.followerClerkId, callerId))
  return [callerId, ...rows.map((r) => r.id)]
}

/** me-row derived directly from the visible top list (friends scope). */
function meFromTop(
  callerId: string | null,
  topRows: Array<Row>,
  levels: Awaited<ReturnType<typeof loadLevels>>
): (LeaderboardEntry & { inTop: boolean }) | null {
  if (!callerId) return null
  const idx = topRows.findIndex((r) => r.clerk_id === callerId)
  if (idx < 0) return null
  return { ...toEntry(topRows[idx], idx + 1, levels), inTop: true }
}

export async function getLeaderboard(input: {
  scope: LeaderboardScope
  metric: LeaderboardMetric
  callerId: string | null
}): Promise<LeaderboardResult> {
  const { scope, metric, callerId } = input
  const levels = await loadLevels()

  // Friends scope needs a signed-in caller; anonymous → empty (UI shows the
  // sign-in prompt). The friend set always includes the caller, so the friends
  // list is never empty for a signed-in user.
  const friendIds =
    scope === "friends" ? (callerId ? await followedSet(callerId) : null) : null
  if (scope === "friends" && !friendIds) {
    return { scope, metric, totalActiveLines: null, top: [], me: null }
  }
  const inFriends =
    friendIds &&
    sql`AND u.clerk_id IN (${sql.join(
      friendIds.map((id) => sql`${id}`),
      sql`, `
    )})`

  let topRows: Array<Row>
  let totalActiveLines: number | null = null

  if (metric === "punchlines") {
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(punchlines)
      .where(and(eq(punchlines.active, true), eq(punchlines.reviewed, true)))
    totalActiveLines = total

    topRows = friendIds
      ? await rawRows<Row>(sql`
          SELECT u.clerk_id, u.handle, u.image_url, u.total_xp, count(p.id)::int AS metric
          FROM ${users} u
          LEFT JOIN ${userPunchlineXp} up ON up.clerk_id = u.clerk_id
          LEFT JOIN ${punchlines} p ON p.id = up.punchline_id AND p.active AND p.reviewed
          WHERE u.handle IS NOT NULL ${inFriends}
          GROUP BY u.clerk_id, u.handle, u.image_url, u.total_xp
          ORDER BY metric DESC, u.total_xp DESC
          LIMIT ${TOP_N}
        `)
      : await rawRows<Row>(sql`
          SELECT u.clerk_id, u.handle, u.image_url, u.total_xp, count(*)::int AS metric
          FROM ${userPunchlineXp} up
          JOIN ${punchlines} p ON p.id = up.punchline_id AND p.active AND p.reviewed
          JOIN ${users} u ON u.clerk_id = up.clerk_id AND u.handle IS NOT NULL
          GROUP BY u.clerk_id, u.handle, u.image_url, u.total_xp
          ORDER BY metric DESC, u.total_xp DESC
          LIMIT ${TOP_N}
        `)
  } else if (metric === "contributed") {
    // Rank by accepted-bar count. Global hides 0-approved contributors and
    // tiebreaks by acceptance rate then most-recent acceptance; friends shows
    // the full set (zeros at the bottom) since it's a closed roster.
    topRows = friendIds
      ? await rawRows<Row>(sql`
          SELECT u.clerk_id, u.handle, u.image_url, u.total_xp,
            count(ps.id) FILTER (WHERE ps.status = 'approved')::int AS metric
          FROM ${users} u
          LEFT JOIN ${punchlineSubmissions} ps ON ps.submitter_clerk_id = u.clerk_id
          WHERE u.handle IS NOT NULL ${inFriends}
          GROUP BY u.clerk_id, u.handle, u.image_url, u.total_xp
          ORDER BY metric DESC, u.total_xp DESC
          LIMIT ${TOP_N}
        `)
      : await rawRows<Row>(sql`
          SELECT u.clerk_id, u.handle, u.image_url, u.total_xp,
            count(*) FILTER (WHERE ps.status = 'approved')::int AS metric
          FROM ${punchlineSubmissions} ps
          JOIN ${users} u ON u.clerk_id = ps.submitter_clerk_id AND u.handle IS NOT NULL
          GROUP BY u.clerk_id, u.handle, u.image_url, u.total_xp
          HAVING count(*) FILTER (WHERE ps.status = 'approved') > 0
          ORDER BY metric DESC,
            (count(*) FILTER (WHERE ps.status = 'approved')::float
              / NULLIF(count(*) FILTER (WHERE ps.status IN ('approved','rejected')), 0)) DESC NULLS LAST,
            max(ps.created_at) FILTER (WHERE ps.status = 'approved') DESC
          LIMIT ${TOP_N}
        `)
  } else {
    // rank: all-time XP ladder. metric = total XP.
    topRows = friendIds
      ? await rawRows<Row>(sql`
          SELECT u.clerk_id, u.handle, u.image_url, u.total_xp, u.total_xp AS metric
          FROM ${users} u
          WHERE u.handle IS NOT NULL ${inFriends}
          ORDER BY u.total_xp DESC
          LIMIT ${TOP_N}
        `)
      : ((await db
          .select({
            clerk_id: users.clerkId,
            handle: users.handle,
            image_url: users.imageUrl,
            total_xp: users.totalXp,
            metric: users.totalXp,
          })
          .from(users)
          .where(isNotNull(users.handle))
          .orderBy(desc(users.totalXp))
          .limit(TOP_N)) as Array<Row>)
  }

  // Friends is a closed set including self, so the caller is always in the
  // visible list → derive me from it. Global needs a separate rank query for
  // callers below the top 100.
  const me = friendIds
    ? meFromTop(callerId, topRows, levels)
    : await computeMe({ metric, callerId, levels, topRows })

  const top = topRows.map((r, i) => toEntry(r, i + 1, levels))

  return { scope, metric, totalActiveLines, top, me }
}

export const getLeaderboardFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { scope: LeaderboardScope; metric: LeaderboardMetric }) => d
  )
  .handler(async ({ data }): Promise<LeaderboardResult> => {
    const req = getRequest()
    const result = await getActor(req)
    const callerId = result?.actor.kind === "clerk" ? result.actor.userId : null
    return getLeaderboard({
      scope: data.scope,
      metric: data.metric,
      callerId,
    })
  })

async function computeMe(args: {
  metric: LeaderboardMetric
  callerId: string | null
  levels: Awaited<ReturnType<typeof loadLevels>>
  topRows: Array<Row>
}): Promise<(LeaderboardEntry & { inTop: boolean }) | null> {
  const { metric, callerId, levels, topRows } = args
  if (!callerId) return null

  // Only onboarded (handle-set) users rank.
  const meRows = await db
    .select({
      handle: users.handle,
      imageUrl: users.imageUrl,
      totalXp: users.totalXp,
    })
    .from(users)
    .where(eq(users.clerkId, callerId))
    .limit(1)
  if (meRows.length === 0) return null
  const meUser = meRows[0]
  if (!meUser.handle) return null

  const topIdx = topRows.findIndex((r) => r.clerk_id === callerId)
  const inTop = topIdx >= 0

  let metricValue: number
  let rank: number

  if (metric === "contributed") {
    const rows = await rawRows<{ metric: number; rank: number }>(sql`
      WITH cnt AS (
        SELECT ps.submitter_clerk_id AS clerk_id,
          count(*) FILTER (WHERE ps.status = 'approved')::int AS c
        FROM ${punchlineSubmissions} ps
        JOIN ${users} u ON u.clerk_id = ps.submitter_clerk_id AND u.handle IS NOT NULL
        GROUP BY ps.submitter_clerk_id
        HAVING count(*) FILTER (WHERE ps.status = 'approved') > 0
      )
      SELECT me.c AS metric, (SELECT count(*) FROM cnt WHERE cnt.c > me.c)::int + 1 AS rank
      FROM cnt me WHERE me.clerk_id = ${callerId}
    `)
    // No accepted bars yet → not ranked on the contributed board.
    if (rows.length === 0) return null
    metricValue = Number(rows[0].metric)
    rank = Number(rows[0].rank)
  } else if (metric === "punchlines") {
    const rows = await rawRows<{ metric: number; rank: number }>(sql`
      WITH cnt AS (
        SELECT up.clerk_id, count(*)::int AS c
        FROM ${userPunchlineXp} up
        JOIN ${punchlines} p ON p.id = up.punchline_id AND p.active AND p.reviewed
        JOIN ${users} u ON u.clerk_id = up.clerk_id AND u.handle IS NOT NULL
        GROUP BY up.clerk_id
      )
      SELECT me.c AS metric, (SELECT count(*) FROM cnt WHERE cnt.c > me.c)::int + 1 AS rank
      FROM cnt me WHERE me.clerk_id = ${callerId}
    `)
    if (rows.length === 0) {
      // Onboarded but zero solves: rank below everyone who has solved a line.
      const [{ ranked }] = await db
        .select({
          ranked: sql<number>`count(distinct ${userPunchlineXp.clerkId})::int`,
        })
        .from(userPunchlineXp)
        .innerJoin(
          punchlines,
          and(
            eq(punchlines.id, userPunchlineXp.punchlineId),
            eq(punchlines.active, true),
            eq(punchlines.reviewed, true)
          )
        )
        .innerJoin(
          users,
          and(
            eq(users.clerkId, userPunchlineXp.clerkId),
            isNotNull(users.handle)
          )
        )
      metricValue = 0
      rank = ranked + 1
    } else {
      metricValue = Number(rows[0].metric)
      rank = Number(rows[0].rank)
    }
  } else {
    // rank: all-time XP.
    const [{ ahead }] = await db
      .select({ ahead: sql<number>`count(*)::int` })
      .from(users)
      .where(and(isNotNull(users.handle), gt(users.totalXp, meUser.totalXp)))
    metricValue = meUser.totalXp
    rank = ahead + 1
  }

  return {
    // If the caller is in the top list, use that exact position so the
    // highlighted row matches its rank in the visible list.
    rank: inTop ? topIdx + 1 : rank,
    handle: meUser.handle,
    imageUrl: meUser.imageUrl,
    totalXp: meUser.totalXp,
    level: levelFor(meUser.totalXp, levels).current,
    metric: metricValue,
    inTop,
  }
}
