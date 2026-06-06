import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { desc, eq, sql } from "drizzle-orm"
import {
  artists,
  punchlines,
  songs,
  userPunchlineXp,
  users,
} from "@workspace/db"

import { getActor } from "./auth"
import { getContributorProfile } from "./contributor"
import { db } from "./db"
import { doFollow, doUnfollow, getFollowCounts, getIsFollowing } from "./follow"
import { ensureUser, getProfileSnapshot, levelInfos, loadLevels } from "./xp"
import type { FollowResult } from "./follow"
import type { ContributorProfile } from "./contributor"
import type { LevelInfo, ProfileSnapshot } from "./xp"

/**
 * Public profile (`/u/$handle`). Logged-out viewable. The client only ever
 * knows handles (URLs are /u/handle), so follow actions here are handle-based
 * — other users' Clerk ids stay server-side, consistent with the leaderboard
 * exposing handle-only.
 */

export type TopArtist = {
  id: number
  slug: string
  name: string
  imageUrl: string | null
  solved: number
}

type ResolvedUser = {
  clerkId: string
  handle: string
  avatarKey: string | null
  imageUrl: string | null
}

/** Resolve a handle → user via the case-insensitive lower(handle) index. */
async function resolveHandle(handle: string): Promise<ResolvedUser | null> {
  const h = (handle ?? "").trim()
  if (!h) return null
  const [row] = await db
    .select({
      clerkId: users.clerkId,
      handle: users.handle,
      avatarKey: users.avatarKey,
      imageUrl: users.imageUrl,
    })
    .from(users)
    .where(sql`lower(${users.handle}) = lower(${h})`)
    .limit(1)
  if (!row || !row.handle) return null
  return {
    clerkId: row.clerkId,
    handle: row.handle,
    avatarKey: row.avatarKey,
    imageUrl: row.imageUrl,
  }
}

/** Top artists for a user by bars-solved count. */
async function getTopArtists(
  clerkId: string,
  limit = 3
): Promise<Array<TopArtist>> {
  const rows = await db
    .select({
      id: artists.id,
      slug: artists.slug,
      name: artists.name,
      imageUrl: artists.imageUrl,
      solved: sql<number>`count(*)::int`,
    })
    .from(userPunchlineXp)
    .innerJoin(punchlines, eq(punchlines.id, userPunchlineXp.punchlineId))
    .innerJoin(songs, eq(songs.id, punchlines.songId))
    .innerJoin(artists, eq(artists.id, songs.artistId))
    .where(eq(userPunchlineXp.clerkId, clerkId))
    .groupBy(artists.id)
    .orderBy(desc(sql`count(*)`), artists.name)
    .limit(limit)
  return rows.map((r) => ({ ...r, solved: Number(r.solved) }))
}

async function callerClerkId(): Promise<string | null> {
  const result = await getActor(getRequest())
  return result?.actor.kind === "clerk" ? result.actor.userId : null
}

export type PublicProfileResult =
  | { found: false }
  | {
      found: true
      handle: string
      avatarKey: string | null
      imageUrl: string | null
      viewerSignedIn: boolean
      isOwner: boolean
      isFollowing: boolean
      followers: number
      following: number
      profile: ProfileSnapshot
      /** Full rank ladder (threshold-ascending) for the level-progression strip. */
      allLevels: Array<LevelInfo>
      topArtists: Array<TopArtist>
      contributor: ContributorProfile
    }

/** Load a public profile by handle. No auth required (logged-out viewable). */
export const getPublicProfileFn = createServerFn({ method: "GET" })
  .inputValidator((d: { handle: string }) => d)
  .handler(async ({ data }): Promise<PublicProfileResult> => {
    const target = await resolveHandle(data.handle)
    if (!target) return { found: false }

    const viewerId = await callerClerkId()
    const isOwner = viewerId === target.clerkId

    const [
      profile,
      allLevelsRows,
      topArtists,
      counts,
      isFollowing,
      contributor,
    ] = await Promise.all([
      getProfileSnapshot(target.clerkId),
      loadLevels(),
      getTopArtists(target.clerkId),
      getFollowCounts(target.clerkId),
      viewerId && !isOwner
        ? getIsFollowing(viewerId, target.clerkId)
        : Promise.resolve(false),
      getContributorProfile(target.clerkId),
    ])

    return {
      found: true,
      handle: target.handle,
      avatarKey: target.avatarKey,
      imageUrl: target.imageUrl,
      viewerSignedIn: viewerId !== null,
      isOwner,
      isFollowing,
      followers: counts.followers,
      following: counts.following,
      profile,
      allLevels: levelInfos(allLevelsRows),
      topArtists,
      contributor,
    }
  })

/**
 * Persist the caller's Clerk avatar URL so public profiles can render it for
 * any user (the server can't see another user's Clerk image). Driven from the
 * header where `useUser().imageUrl` is available; updates only when changed.
 */
export const syncProfileImageFn = createServerFn({ method: "POST" })
  .inputValidator((d: { imageUrl: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const viewerId = await callerClerkId()
    if (!viewerId) return { ok: true }
    const url = (data.imageUrl ?? "").trim().slice(0, 2048)
    if (!url) return { ok: true }
    await ensureUser(viewerId)
    const [row] = await db
      .select({ imageUrl: users.imageUrl })
      .from(users)
      .where(eq(users.clerkId, viewerId))
      .limit(1)
    if (row?.imageUrl !== url) {
      await db
        .update(users)
        .set({ imageUrl: url })
        .where(eq(users.clerkId, viewerId))
    }
    return { ok: true }
  })

export type MyHandleResult = { signedIn: boolean; handle: string | null }

/** The signed-in user's own handle — drives the /profile → /u/$handle redirect. */
export const getMyHandleFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyHandleResult> => {
    const viewerId = await callerClerkId()
    if (!viewerId) return { signedIn: false, handle: null }
    const [row] = await db
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.clerkId, viewerId))
      .limit(1)
    return { signedIn: true, handle: row?.handle ?? null }
  }
)

/** Follow by handle (the client knows handles, not clerk ids). Auth-required. */
export const followByHandleFn = createServerFn({ method: "POST" })
  .inputValidator((d: { handle: string }) => d)
  .handler(async ({ data }): Promise<FollowResult> => {
    const followerId = await callerClerkId()
    if (!followerId) throw new Error("Authentication required")
    const target = await resolveHandle(data.handle)
    if (!target) throw new Error("User not found")
    return doFollow(followerId, target.clerkId)
  })

/** Unfollow by handle. Auth-required, idempotent. */
export const unfollowByHandleFn = createServerFn({ method: "POST" })
  .inputValidator((d: { handle: string }) => d)
  .handler(async ({ data }): Promise<FollowResult> => {
    const followerId = await callerClerkId()
    if (!followerId) throw new Error("Authentication required")
    const target = await resolveHandle(data.handle)
    if (!target) throw new Error("User not found")
    return doUnfollow(followerId, target.clerkId)
  })
