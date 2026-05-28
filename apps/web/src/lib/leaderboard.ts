import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import {  and, desc, eq, gt, isNotNull, sql } from "drizzle-orm"
import { punchlines, userPunchlineXp, users } from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import {  levelFor, loadLevels } from "./xp"
import type {SQL} from "drizzle-orm";
import type {LevelInfo} from "./xp";

export type LeaderboardBoard = "xp" | "completion"
export type LeaderboardWindow = "weekly" | "alltime"

export type LeaderboardEntry = {
  rank: number
  handle: string
  avatarKey: string | null
  /** All-time XP — drives the rank badge regardless of the active board. */
  totalXp: number
  level: LevelInfo
  /** The ranked value: XP (windowed or total) or solved-line count. */
  metric: number
}

export type LeaderboardResult = {
  board: LeaderboardBoard
  window: LeaderboardWindow
  /** Denominator for the completion board (active lines); null otherwise. */
  totalActiveLines: number | null
  top: Array<LeaderboardEntry>
  me: (LeaderboardEntry & { inTop: boolean }) | null
}

const TOP_N = 100

/** Monday 00:00 UTC of the current week — consistent with the app's UTC day math. */
function currentWeekStartUtc(): Date {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysSinceMonday)
  return d
}

async function rawRows<T>(query: SQL): Promise<Array<T>> {
  const res = (await db.execute(query)) as unknown as { rows?: Array<T> } | Array<T>
  return (Array.isArray(res) ? res : (res.rows ?? []))
}

type Row = {
  clerk_id: string
  handle: string
  avatar_key: string | null
  total_xp: number
  metric: number
}

function toEntry(row: Row, rank: number, levels: Awaited<ReturnType<typeof loadLevels>>): LeaderboardEntry {
  return {
    rank,
    handle: row.handle,
    avatarKey: row.avatar_key,
    totalXp: row.total_xp,
    level: levelFor(row.total_xp, levels).current,
    metric: Number(row.metric),
  }
}

export async function getLeaderboard(input: {
  board: LeaderboardBoard
  window: LeaderboardWindow
  callerId: string | null
}): Promise<LeaderboardResult> {
  const { board, callerId } = input
  // Completion is inherently all-time; only XP honors the weekly window.
  const window: LeaderboardWindow = board === "completion" ? "alltime" : input.window
  const levels = await loadLevels()

  let topRows: Array<Row>
  let totalActiveLines: number | null = null

  if (board === "completion") {
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(punchlines)
      .where(eq(punchlines.active, true))
    totalActiveLines = total

    topRows = await rawRows<Row>(sql`
      SELECT u.clerk_id, u.handle, u.avatar_key, u.total_xp, count(*)::int AS metric
      FROM ${userPunchlineXp} up
      JOIN ${punchlines} p ON p.id = up.punchline_id AND p.active
      JOIN ${users} u ON u.clerk_id = up.clerk_id AND u.handle IS NOT NULL
      GROUP BY u.clerk_id, u.handle, u.avatar_key, u.total_xp
      ORDER BY metric DESC, u.total_xp DESC
      LIMIT ${TOP_N}
    `)
  } else if (window === "weekly") {
    const start = currentWeekStartUtc()
    topRows = await rawRows<Row>(sql`
      SELECT u.clerk_id, u.handle, u.avatar_key, u.total_xp, COALESCE(SUM(t.xp), 0)::int AS metric
      FROM ${users} u
      JOIN (
        SELECT clerk_id, xp_awarded AS xp FROM ${userPunchlineXp} WHERE created_at >= ${start}
        UNION ALL
        SELECT clerk_id, xp_awarded AS xp FROM user_daily_xp WHERE created_at >= ${start}
      ) t ON t.clerk_id = u.clerk_id
      WHERE u.handle IS NOT NULL
      GROUP BY u.clerk_id, u.handle, u.avatar_key, u.total_xp
      ORDER BY metric DESC
      LIMIT ${TOP_N}
    `)
  } else {
    const rows = await db
      .select({
        clerk_id: users.clerkId,
        handle: users.handle,
        avatar_key: users.avatarKey,
        total_xp: users.totalXp,
        metric: users.totalXp,
      })
      .from(users)
      .where(isNotNull(users.handle))
      .orderBy(desc(users.totalXp))
      .limit(TOP_N)
    topRows = rows as Array<Row>
  }

  const top = topRows.map((r, i) => toEntry(r, i + 1, levels))

  const me = await computeMe({ board, window, callerId, levels, topRows })

  return { board, window, totalActiveLines, top, me }
}

export const getLeaderboardFn = createServerFn({ method: "POST" })
  .inputValidator((d: { board: LeaderboardBoard; window: LeaderboardWindow }) => d)
  .handler(async ({ data }): Promise<LeaderboardResult> => {
    const req = getRequest()
    const result = await getActor(req)
    const callerId = result?.actor.kind === "clerk" ? result.actor.userId : null
    return getLeaderboard({ board: data.board, window: data.window, callerId })
  })

async function computeMe(args: {
  board: LeaderboardBoard
  window: LeaderboardWindow
  callerId: string | null
  levels: Awaited<ReturnType<typeof loadLevels>>
  topRows: Array<Row>
}): Promise<(LeaderboardEntry & { inTop: boolean }) | null> {
  const { board, window, callerId, levels, topRows } = args
  if (!callerId) return null

  // Only onboarded (handle-set) users rank.
  const meRows = await db
    .select({ handle: users.handle, avatarKey: users.avatarKey, totalXp: users.totalXp })
    .from(users)
    .where(eq(users.clerkId, callerId))
    .limit(1)
  if (meRows.length === 0) return null
  const meUser = meRows[0]
  if (!meUser.handle) return null

  const topIdx = topRows.findIndex((r) => r.clerk_id === callerId)
  const inTop = topIdx >= 0

  let metric: number
  let rank: number

  if (board === "completion") {
    const rows = await rawRows<{ metric: number; rank: number }>(sql`
      WITH cnt AS (
        SELECT up.clerk_id, count(*)::int AS c
        FROM ${userPunchlineXp} up
        JOIN ${punchlines} p ON p.id = up.punchline_id AND p.active
        JOIN ${users} u ON u.clerk_id = up.clerk_id AND u.handle IS NOT NULL
        GROUP BY up.clerk_id
      )
      SELECT me.c AS metric, (SELECT count(*) FROM cnt WHERE cnt.c > me.c)::int + 1 AS rank
      FROM cnt me WHERE me.clerk_id = ${callerId}
    `)
    if (rows.length === 0) {
      // Onboarded but zero solves: rank below everyone who has solved a line.
      const [{ ranked }] = await db
        .select({ ranked: sql<number>`count(distinct ${userPunchlineXp.clerkId})::int` })
        .from(userPunchlineXp)
        .innerJoin(punchlines, and(eq(punchlines.id, userPunchlineXp.punchlineId), eq(punchlines.active, true)))
        .innerJoin(users, and(eq(users.clerkId, userPunchlineXp.clerkId), isNotNull(users.handle)))
      metric = 0
      rank = ranked + 1
    } else {
      metric = Number(rows[0].metric)
      rank = Number(rows[0].rank)
    }
  } else if (window === "weekly") {
    const start = currentWeekStartUtc()
    const rows = await rawRows<{ metric: number; rank: number }>(sql`
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
      SELECT me.xp AS metric, (SELECT count(*) FROM wk WHERE wk.xp > me.xp)::int + 1 AS rank
      FROM wk me WHERE me.clerk_id = ${callerId}
    `)
    if (rows.length === 0) return null // no weekly activity → not ranked this week
    metric = Number(rows[0].metric)
    rank = Number(rows[0].rank)
  } else {
    const [{ ahead }] = await db
      .select({ ahead: sql<number>`count(*)::int` })
      .from(users)
      .where(and(isNotNull(users.handle), gt(users.totalXp, meUser.totalXp)))
    metric = meUser.totalXp
    rank = ahead + 1
  }

  return {
    // If the caller is in the top list, use that exact position so the
    // highlighted row matches its rank in the visible list.
    rank: inTop ? topIdx + 1 : rank,
    handle: meUser.handle,
    avatarKey: meUser.avatarKey,
    totalXp: meUser.totalXp,
    level: levelFor(meUser.totalXp, levels).current,
    metric,
    inTop,
  }
}
