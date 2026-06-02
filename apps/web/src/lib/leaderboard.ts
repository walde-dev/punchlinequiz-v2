import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import {  and, desc, eq, gt, isNotNull, sql } from "drizzle-orm"
import { follows, punchlineSubmissions, punchlines, songs, userPunchlineXp, users } from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import {  levelFor, loadLevels } from "./xp"
import type {SQL} from "drizzle-orm";
import type {LevelInfo} from "./xp";

/**
 * Boards: xp (weekly calendar-week | all-time totalXp), completion (global
 * bars-solved, all-time), friends (weekly XP among the followed set + self),
 * artist (bars-solved for one artist). friends/artist were added in PUN-13.
 */
export type LeaderboardBoard = "xp" | "completion" | "friends" | "artist" | "contributor"
export type LeaderboardWindow = "weekly" | "alltime"

export type LeaderboardEntry = {
  rank: number
  handle: string
  imageUrl: string | null
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
  image_url: string | null
  total_xp: number
  metric: number
}

function toEntry(row: Row, rank: number, levels: Awaited<ReturnType<typeof loadLevels>>): LeaderboardEntry {
  return {
    rank,
    handle: row.handle,
    imageUrl: row.image_url,
    totalXp: row.total_xp,
    level: levelFor(row.total_xp, levels).current,
    metric: Number(row.metric),
  }
}

/** Clerk ids the user follows, plus themselves (the friends-board scope). */
async function followedSet(callerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: follows.followeeClerkId })
    .from(follows)
    .where(eq(follows.followerClerkId, callerId))
  return [callerId, ...rows.map((r) => r.id)]
}

/** me-row derived directly from the visible top list (friends/artist boards). */
function meFromTop(
  callerId: string | null,
  topRows: Array<Row>,
  levels: Awaited<ReturnType<typeof loadLevels>>,
): (LeaderboardEntry & { inTop: boolean }) | null {
  if (!callerId) return null
  const idx = topRows.findIndex((r) => r.clerk_id === callerId)
  if (idx < 0) return null
  return { ...toEntry(topRows[idx], idx + 1, levels), inTop: true }
}

export async function getLeaderboard(input: {
  board: LeaderboardBoard
  window: LeaderboardWindow
  artistId?: number
  callerId: string | null
}): Promise<LeaderboardResult> {
  const { board, callerId, artistId } = input
  // Only the XP board honors a weekly/all-time toggle. completion + artist are
  // all-time bars-solved; friends is always the weekly window.
  const window: LeaderboardWindow =
    board === "completion" || board === "artist" || board === "contributor"
      ? "alltime"
      : board === "friends"
        ? "weekly"
        : input.window
  const levels = await loadLevels()

  let topRows: Array<Row>
  let totalActiveLines: number | null = null
  let me: (LeaderboardEntry & { inTop: boolean }) | null = null

  if (board === "friends") {
    // Weekly XP among the followed set + self. Anonymous → empty board.
    if (!callerId) {
      return { board, window, totalActiveLines, top: [], me: null }
    }
    const ids = await followedSet(callerId)
    const start = currentWeekStartUtc()
    const inList = sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )
    // LEFT JOIN so everyone you follow shows even at 0 XP this week.
    topRows = await rawRows<Row>(sql`
      SELECT u.clerk_id, u.handle, u.image_url, u.total_xp, COALESCE(SUM(t.xp), 0)::int AS metric
      FROM ${users} u
      LEFT JOIN (
        SELECT clerk_id, xp_awarded AS xp FROM ${userPunchlineXp} WHERE created_at >= ${start}
        UNION ALL
        SELECT clerk_id, xp_awarded AS xp FROM user_daily_xp WHERE created_at >= ${start}
      ) t ON t.clerk_id = u.clerk_id
      WHERE u.handle IS NOT NULL AND u.clerk_id IN (${inList})
      GROUP BY u.clerk_id, u.handle, u.image_url, u.total_xp
      ORDER BY metric DESC, u.total_xp DESC
      LIMIT ${TOP_N}
    `)
    me = meFromTop(callerId, topRows, levels)
  } else if (board === "artist") {
    // Bars-solved for one artist. metric = solved count for that artist.
    if (!artistId) {
      return { board, window, totalActiveLines: 0, top: [], me: null }
    }
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .where(and(eq(punchlines.active, true), eq(songs.artistId, artistId)))
    totalActiveLines = total

    topRows = await rawRows<Row>(sql`
      SELECT u.clerk_id, u.handle, u.image_url, u.total_xp, count(*)::int AS metric
      FROM ${userPunchlineXp} up
      JOIN ${punchlines} p ON p.id = up.punchline_id AND p.active
      JOIN ${songs} s ON s.id = p.song_id AND s.artist_id = ${artistId}
      JOIN ${users} u ON u.clerk_id = up.clerk_id AND u.handle IS NOT NULL
      GROUP BY u.clerk_id, u.handle, u.image_url, u.total_xp
      ORDER BY metric DESC, u.total_xp DESC
      LIMIT ${TOP_N}
    `)
    me = meFromTop(callerId, topRows, levels)
  } else if (board === "contributor") {
    // Rank by accepted-bar count (all-time). Tiebreak: acceptance rate, then
    // most-recent acceptance. Only contributors with ≥1 accepted bar appear.
    topRows = await rawRows<Row>(sql`
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
    me = await computeMe({ board, window, callerId, levels, topRows })
  } else if (board === "completion") {
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(punchlines)
      .where(eq(punchlines.active, true))
    totalActiveLines = total

    topRows = await rawRows<Row>(sql`
      SELECT u.clerk_id, u.handle, u.image_url, u.total_xp, count(*)::int AS metric
      FROM ${userPunchlineXp} up
      JOIN ${punchlines} p ON p.id = up.punchline_id AND p.active
      JOIN ${users} u ON u.clerk_id = up.clerk_id AND u.handle IS NOT NULL
      GROUP BY u.clerk_id, u.handle, u.image_url, u.total_xp
      ORDER BY metric DESC, u.total_xp DESC
      LIMIT ${TOP_N}
    `)
    me = await computeMe({ board, window, callerId, levels, topRows })
  } else if (window === "weekly") {
    const start = currentWeekStartUtc()
    topRows = await rawRows<Row>(sql`
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
      LIMIT ${TOP_N}
    `)
    me = await computeMe({ board, window, callerId, levels, topRows })
  } else {
    const rows = await db
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
      .limit(TOP_N)
    topRows = rows as Array<Row>
    me = await computeMe({ board, window, callerId, levels, topRows })
  }

  const top = topRows.map((r, i) => toEntry(r, i + 1, levels))

  return { board, window, totalActiveLines, top, me }
}

export const getLeaderboardFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { board: LeaderboardBoard; window: LeaderboardWindow; artistId?: number }) => d,
  )
  .handler(async ({ data }): Promise<LeaderboardResult> => {
    const req = getRequest()
    const result = await getActor(req)
    const callerId = result?.actor.kind === "clerk" ? result.actor.userId : null
    return getLeaderboard({
      board: data.board,
      window: data.window,
      artistId: data.artistId,
      callerId,
    })
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
    .select({ handle: users.handle, imageUrl: users.imageUrl, totalXp: users.totalXp })
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

  if (board === "contributor") {
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
    // No accepted bars yet → not ranked on the contributor board.
    if (rows.length === 0) return null
    metric = Number(rows[0].metric)
    rank = Number(rows[0].rank)
  } else if (board === "completion") {
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
    imageUrl: meUser.imageUrl,
    totalXp: meUser.totalXp,
    level: levelFor(meUser.totalXp, levels).current,
    metric,
    inTop,
  }
}
