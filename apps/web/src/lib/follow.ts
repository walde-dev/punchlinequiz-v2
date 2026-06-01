import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, eq, sql } from "drizzle-orm"
import { follows, users } from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import { ensureUser } from "./xp"

/**
 * Asymmetric follow graph. follow/unfollow are auth-required, idempotent, and
 * server-authoritative. Counts + isFollowing are public reads (the public
 * profile renders them for logged-out visitors).
 *
 * Logging: follow_user / unfollow_user are emitted client-side at the Follow
 * button call site (PUN-6), matching the existing logEvent convention where
 * server functions stay pure (see lib/game.ts submitAnswer).
 */

export type FollowCounts = { followers: number; following: number }

/** Resolve the signed-in Clerk user id, or null for anonymous. */
async function callerClerkId(): Promise<string | null> {
  const result = await getActor(getRequest())
  return result?.actor.kind === "clerk" ? result.actor.userId : null
}

async function countFollowers(clerkId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followeeClerkId, clerkId))
  return row?.c ?? 0
}

async function countFollowing(clerkId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followerClerkId, clerkId))
  return row?.c ?? 0
}

/** Plain helper (server-side reuse, e.g. the public profile loader). */
export async function getFollowCounts(clerkId: string): Promise<FollowCounts> {
  const [followers, following] = await Promise.all([
    countFollowers(clerkId),
    countFollowing(clerkId),
  ])
  return { followers, following }
}

/** Plain helper: does viewer follow target? Reused by the public profile loader. */
export async function getIsFollowing(viewerId: string, targetId: string): Promise<boolean> {
  const rows = await db
    .select({ x: sql`1` })
    .from(follows)
    .where(
      and(eq(follows.followerClerkId, viewerId), eq(follows.followeeClerkId, targetId)),
    )
    .limit(1)
  return rows.length > 0
}

export type FollowResult = { isFollowing: boolean; followerCount: number }

/**
 * Core follow op (auth resolved by the caller). Idempotent: re-following is a
 * no-op via the composite PK. Guards self-follow + missing target.
 */
export async function doFollow(followerId: string, followeeId: string): Promise<FollowResult> {
  if (followerId === followeeId) throw new Error("Cannot follow yourself")
  await ensureUser(followerId)
  const [target] = await db
    .select({ clerkId: users.clerkId })
    .from(users)
    .where(eq(users.clerkId, followeeId))
    .limit(1)
  if (!target) throw new Error("User not found")
  await db
    .insert(follows)
    .values({ followerClerkId: followerId, followeeClerkId: followeeId })
    .onConflictDoNothing()
  return { isFollowing: true, followerCount: await countFollowers(followeeId) }
}

/** Core unfollow op. Idempotent: unfollowing a non-followed user is a no-op. */
export async function doUnfollow(followerId: string, followeeId: string): Promise<FollowResult> {
  await db
    .delete(follows)
    .where(and(eq(follows.followerClerkId, followerId), eq(follows.followeeClerkId, followeeId)))
  return { isFollowing: false, followerCount: await countFollowers(followeeId) }
}

/** Follow a user by clerk id. Idempotent, auth-required. */
export const followFn = createServerFn({ method: "POST" })
  .inputValidator((d: { followeeClerkId: string }) => {
    const id = (d?.followeeClerkId ?? "").trim()
    if (!id) throw new Error("followeeClerkId required")
    return { followeeClerkId: id }
  })
  .handler(async ({ data }): Promise<FollowResult> => {
    const followerId = await callerClerkId()
    if (!followerId) throw new Error("Authentication required")
    return doFollow(followerId, data.followeeClerkId)
  })

/** Unfollow a user by clerk id. Idempotent, auth-required. */
export const unfollowFn = createServerFn({ method: "POST" })
  .inputValidator((d: { followeeClerkId: string }) => {
    const id = (d?.followeeClerkId ?? "").trim()
    if (!id) throw new Error("followeeClerkId required")
    return { followeeClerkId: id }
  })
  .handler(async ({ data }): Promise<FollowResult> => {
    const followerId = await callerClerkId()
    if (!followerId) throw new Error("Authentication required")
    return doUnfollow(followerId, data.followeeClerkId)
  })

/** Follower + following counts for a user. Public read. */
export const followCountsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { clerkId: string }) => d)
  .handler(async ({ data }): Promise<FollowCounts> => {
    return getFollowCounts(data.clerkId)
  })

/**
 * Whether the signed-in caller follows `targetClerkId`. Returns false for
 * anonymous callers (drives the Follow button's initial state).
 */
export const isFollowingFn = createServerFn({ method: "GET" })
  .inputValidator((d: { targetClerkId: string }) => d)
  .handler(async ({ data }): Promise<boolean> => {
    const viewerId = await callerClerkId()
    if (!viewerId) return false
    return getIsFollowing(viewerId, data.targetClerkId)
  })
