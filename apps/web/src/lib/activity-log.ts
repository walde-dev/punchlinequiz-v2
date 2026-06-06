import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, desc, gte, inArray, like, lt, lte, ne, notInArray, notLike, or, sql } from "drizzle-orm"

import { anonXpClaims, gameEvents, users } from "@workspace/db"

import { db } from "./db"
import { requireAdmin } from "./auth"
import {
  ACCOUNT_NAMES,
  DISTRIBUTION_NAMES,
  PLAY_NAMES,
  SUBMISSION_NAMES,
  anonName,
} from "./activity-events"
import type { SQL } from "drizzle-orm"
import type { CategoryKey } from "./activity-events"

/**
 * Read-side of the activity log: a unified, newest-first feed over the
 * `game_events` table (the same log analytics aggregates), enriched with the
 * actor's identity. Cursor-paginated by `id` so "load more" is stable even as
 * new events stream in. Filtering (category / date / free-text) happens in SQL
 * so the page only ships what it renders.
 */

// ─── Public shapes ──────────────────────────────────────────────────────────────

export type ActivityActor =
  | { kind: "clerk"; userId: string; handle: string | null; imageUrl: string | null; email: string | null }
  | { kind: "anon"; sessionShort: string; name: string }
  | { kind: "token" }
  | { kind: "system" }

/** A JSON value — props is an untyped JSON blob. Spelling it out (rather than
 *  `unknown`) keeps the server-fn payload type self-serializable. */
export type JsonValue = string | number | boolean | null | Array<JsonValue> | { [k: string]: JsonValue }

export type ActivityItem = {
  id: number
  name: string
  props: { [k: string]: JsonValue }
  createdAt: string // ISO
  actor: ActivityActor
}

export type ActivityPage = {
  items: Array<ActivityItem>
  /** Pass back as `cursor` to fetch the next (older) page; null = end. */
  nextCursor: number | null
}

export type ActivityFilters = {
  category?: CategoryKey | null
  /** Free-text match against session id, actor email, handle, or event name. */
  q?: string | null
  from?: string | null // YYYY-MM-DD (inclusive)
  to?: string | null // YYYY-MM-DD (inclusive)
  /** When true, drop anonymous (and system/CLI) rows — only signed-in users. */
  registeredOnly?: boolean
  cursor?: number | null
  limit?: number
}

// ─── Category → SQL ──────────────────────────────────────────────────────────────

const NAME = gameEvents.name

function categoryCondition(category: CategoryKey): SQL | undefined {
  switch (category) {
    case "play":
      return inArray(NAME, PLAY_NAMES as unknown as Array<string>)
    case "submission":
      return inArray(NAME, SUBMISSION_NAMES as unknown as Array<string>)
    case "account":
      return inArray(NAME, ACCOUNT_NAMES as unknown as Array<string>)
    case "distribution":
      return inArray(NAME, DISTRIBUTION_NAMES as unknown as Array<string>)
    case "daily":
      return like(NAME, "daily_%")
    case "challenge":
      return like(NAME, "challenge_%")
    case "referral":
      return like(NAME, "referral_%")
    case "quiz":
      return like(NAME, "quiz_%")
    case "admin":
      return like(NAME, "admin_%")
    case "leaderboard":
      return or(like(NAME, "leaderboard_%"), sql`${NAME} = 'contributor_leaderboard_viewed'`)
    case "other":
      // Everything that doesn't fall into a named bucket above.
      return and(
        notLike(NAME, "admin_%"),
        notLike(NAME, "daily_%"),
        notLike(NAME, "challenge_%"),
        notLike(NAME, "referral_%"),
        notLike(NAME, "quiz_%"),
        notLike(NAME, "leaderboard_%"),
        ne(NAME, "contributor_leaderboard_viewed"),
        notInArray(NAME, [
          ...PLAY_NAMES,
          ...SUBMISSION_NAMES,
          ...ACCOUNT_NAMES,
          ...DISTRIBUTION_NAMES,
        ] as unknown as Array<string>),
      )
    default:
      return undefined
  }
}

// ─── Actor resolution ─────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

/**
 * The Clerk user id an event is attributable to, if any. Three signals, in
 * order: an explicit `actor_user_id` prop (server-side admin events), a Clerk
 * id used directly as the session id, or — the common case for client play
 * events — an anon session id that was later claimed by an account, resolved
 * via the `anon_xp_claims` mapping passed in `sessionToClerk`.
 */
function actorUserId(
  sessionId: string,
  props: Record<string, unknown>,
  sessionToClerk: Map<string, string>,
): string | null {
  const explicit = str(props.actor_user_id)
  if (explicit) return explicit
  if (sessionId.startsWith("user_")) return sessionId
  return sessionToClerk.get(sessionId) ?? null
}

// ─── Input validation ─────────────────────────────────────────────────────────

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  "play",
  "daily",
  "submission",
  "account",
  "referral",
  "challenge",
  "leaderboard",
  "quiz",
  "distribution",
  "admin",
  "other",
])

function validate(d: ActivityFilters): Required<ActivityFilters> {
  const category =
    typeof d.category === "string" && VALID_CATEGORIES.has(d.category)
      ? (d.category)
      : null
  const limit = Math.min(Math.max(Number(d.limit) || 50, 1), 100)
  return {
    category,
    q: typeof d.q === "string" && d.q.trim() !== "" ? d.q.trim().slice(0, 80) : null,
    from: typeof d.from === "string" && d.from ? d.from : null,
    to: typeof d.to === "string" && d.to ? d.to : null,
    registeredOnly: d.registeredOnly === true,
    cursor: Number.isInteger(d.cursor) ? (d.cursor as number) : null,
    limit,
  }
}

/** An event is attributable to a signed-in Clerk user when its session id is a
 *  Clerk id, props carry an explicit `actor_user_id` (server-side admin
 *  events), or its anon session id was claimed by an account at signup. The
 *  last case is the common one — client play events keep the anon session id
 *  forever, so the `anon_xp_claims` mapping is the only link to the account.
 *  Everything else — unclaimed anon sessions, the admin token, the system
 *  actor — counts as "not a registered user". */
function registeredCondition(): SQL {
  return or(
    like(gameEvents.sessionId, "user_%"),
    sql`(${gameEvents.props} ->> 'actor_user_id') is not null`,
    inArray(
      gameEvents.sessionId,
      db.select({ sessionId: anonXpClaims.sessionId }).from(anonXpClaims),
    ),
  ) as SQL
}

// ─── Server function ──────────────────────────────────────────────────────────

export const getActivityLog = createServerFn({ method: "GET" })
  .inputValidator(validate)
  .handler(async ({ data }): Promise<ActivityPage> => {
    await requireAdmin(getRequest())

    const from = data.from ? new Date(`${data.from}T00:00:00.000Z`) : null
    const to = data.to ? new Date(`${data.to}T23:59:59.999Z`) : null
    const like_ = data.q ? `%${data.q}%` : null

    // Events store only the Clerk id (and usually only the anon session id),
    // never the handle — so a free-text search like "urus" can't hit the events
    // table directly. Resolve matching handles to their Clerk ids, plus the anon
    // session ids those accounts claimed at signup, then match all of them below.
    let handleUserIds: Array<string> = []
    let handleSessionIds: Array<string> = []
    if (like_) {
      const bare = data.q!.replace(/^@/, "")
      const matched = await db
        .select({ clerkId: users.clerkId })
        .from(users)
        .where(sql`${users.handle} ilike ${`%${bare}%`}`)
        .limit(100)
      handleUserIds = matched.map((u) => u.clerkId)
      if (handleUserIds.length > 0) {
        const claims = await db
          .select({ sessionId: anonXpClaims.sessionId })
          .from(anonXpClaims)
          .where(inArray(anonXpClaims.clerkId, handleUserIds))
        handleSessionIds = claims.map((c) => c.sessionId)
      }
    }

    const where = and(
      data.category ? categoryCondition(data.category) : undefined,
      data.registeredOnly ? registeredCondition() : undefined,
      from ? gte(gameEvents.createdAt, from) : undefined,
      to ? lte(gameEvents.createdAt, to) : undefined,
      data.cursor !== null ? lt(gameEvents.id, data.cursor) : undefined,
      like_
        ? or(
            sql`${gameEvents.sessionId} ilike ${like_}`,
            sql`${gameEvents.name} ilike ${like_}`,
            sql`(${gameEvents.props} ->> 'actor_email') ilike ${like_}`,
            handleUserIds.length > 0
              ? or(
                  inArray(gameEvents.sessionId, handleUserIds),
                  inArray(sql`(${gameEvents.props} ->> 'actor_user_id')`, handleUserIds),
                )
              : undefined,
            handleSessionIds.length > 0
              ? inArray(gameEvents.sessionId, handleSessionIds)
              : undefined,
          )
        : undefined,
    )

    // Fetch one extra to know whether an older page exists.
    const rows = await db
      .select({
        id: gameEvents.id,
        sessionId: gameEvents.sessionId,
        name: gameEvents.name,
        props: gameEvents.props,
        createdAt: gameEvents.createdAt,
      })
      .from(gameEvents)
      .where(where)
      .orderBy(desc(gameEvents.id))
      .limit(data.limit + 1)

    const hasMore = rows.length > data.limit
    const page = hasMore ? rows.slice(0, data.limit) : rows

    // Resolve anon session ids on this page to the account that claimed them
    // (play events keep the anon session id even after signup — the claim row
    // is the only link). Batched so a page is at most one extra query.
    const sessionToClerk = new Map<string, string>()
    const anonSessions = [
      ...new Set(
        page
          .filter(
            (r) =>
              !r.sessionId.startsWith("user_") &&
              r.sessionId !== "admin" &&
              r.sessionId !== "admin_token",
          )
          .map((r) => r.sessionId),
      ),
    ]
    if (anonSessions.length > 0) {
      const claims = await db
        .select({ sessionId: anonXpClaims.sessionId, clerkId: anonXpClaims.clerkId })
        .from(anonXpClaims)
        .where(inArray(anonXpClaims.sessionId, anonSessions))
      for (const c of claims) sessionToClerk.set(c.sessionId, c.clerkId)
    }

    // Batch-resolve Clerk identities (handle + avatar) for attributable rows.
    const userIds = new Set<string>()
    for (const r of page) {
      const uid = actorUserId(r.sessionId, r.props, sessionToClerk)
      if (uid) userIds.add(uid)
    }
    const userMap = new Map<string, { handle: string | null; imageUrl: string | null }>()
    if (userIds.size > 0) {
      const found = await db
        .select({ clerkId: users.clerkId, handle: users.handle, imageUrl: users.imageUrl })
        .from(users)
        .where(inArray(users.clerkId, [...userIds]))
      for (const u of found) userMap.set(u.clerkId, { handle: u.handle, imageUrl: u.imageUrl })
    }

    const items: Array<ActivityItem> = page.map((r) => {
      const uid = actorUserId(r.sessionId, r.props, sessionToClerk)
      let actor: ActivityActor
      if (uid) {
        const u = userMap.get(uid)
        actor = {
          kind: "clerk",
          userId: uid,
          handle: u?.handle ?? null,
          imageUrl: u?.imageUrl ?? null,
          email: str(r.props.actor_email),
        }
      } else if (r.sessionId === "admin_token") {
        actor = { kind: "token" }
      } else if (r.sessionId === "admin") {
        actor = { kind: "system" }
      } else {
        actor = { kind: "anon", sessionShort: r.sessionId.slice(0, 6), name: anonName(r.sessionId) }
      }
      return {
        id: r.id,
        name: r.name,
        props: r.props as { [k: string]: JsonValue },
        createdAt: r.createdAt.toISOString(),
        actor,
      }
    })

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    }
  })
