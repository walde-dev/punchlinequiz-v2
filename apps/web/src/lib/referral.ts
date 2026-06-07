import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import {
  anonReferralCodes,
  anonXpClaims,
  challenges,
  pendingAnonReferrals,
  referrals,
  users,
} from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import { getServerSessionId } from "./log"
import type { XpConfig } from "@workspace/db"

async function callerClerkId(): Promise<string | null> {
  const result = await getActor(getRequest())
  return result?.actor.kind === "clerk" ? result.actor.userId : null
}

/** Short opaque referral code — decoupled from the session_id analytics key. */
function genReferralCode(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10)
}

/** Get-or-mint the stable anon referral code for a session (PUN-119). */
export async function mintAnonReferralCode(sessionId: string): Promise<string> {
  if (!sessionId) return ""
  const [existing] = await db
    .select({ code: anonReferralCodes.code })
    .from(anonReferralCodes)
    .where(eq(anonReferralCodes.sessionId, sessionId))
    .limit(1)
  if (existing) return existing.code

  const code = genReferralCode()
  await db
    .insert(anonReferralCodes)
    .values({ code, sessionId })
    .onConflictDoNothing({ target: anonReferralCodes.sessionId })
  // Re-read in case a concurrent share won the unique-session race.
  const [row] = await db
    .select({ code: anonReferralCodes.code })
    .from(anonReferralCodes)
    .where(eq(anonReferralCodes.sessionId, sessionId))
    .limit(1)
  return row?.code ?? code
}

/** Resolve an anon referral code to the sharer's session id, if it exists. */
async function resolveAnonCodeSession(code: string): Promise<string | null> {
  const c = (code ?? "").trim()
  if (!c) return null
  const [row] = await db
    .select({ sessionId: anonReferralCodes.sessionId })
    .from(anonReferralCodes)
    .where(eq(anonReferralCodes.code, c))
    .limit(1)
  return row?.sessionId ?? null
}

/** A claimed anon session resolves to the account that claimed it (PUN-119). */
async function clerkIdForSession(sessionId: string): Promise<string | null> {
  const [row] = await db
    .select({ clerkId: anonXpClaims.clerkId })
    .from(anonXpClaims)
    .where(eq(anonXpClaims.sessionId, sessionId))
    .limit(1)
  return row?.clerkId ?? null
}

/**
 * Referral attribution + reward logic (PUN-71/72).
 *
 * Flow: a first-touch token is captured client-side on an /i/$handle or /c/$slug
 * landing and passed to claimHandleFn at onboarding → recordPendingReferral
 * writes a 'pending' edge. When the referee earns their first correct answer the
 * XP grant path calls confirmReferralOnActivation → flips to 'confirmed' and pays
 * both sides (referrer reward gated by a per-referrer daily cap).
 *
 * This module deliberately does NOT import ./xp (xp.ts imports this for the
 * confirmation hook) — the caller passes the loaded XpConfig in, breaking the
 * cycle.
 */

export type ReferralSource = "invite" | "challenge" | "anon"

/** A first-touch referral token carried from the landing page through sign-up. */
export type ReferralToken = { source: ReferralSource; value: string }

/** Resolve a token to the referrer's clerkId, if the referrer has an account. */
export async function resolveReferrer(
  token: ReferralToken
): Promise<string | null> {
  const value = (token?.value ?? "").trim()
  if (!value) return null
  if (token.source === "invite") {
    const [row] = await db
      .select({ clerkId: users.clerkId })
      .from(users)
      .where(sql`lower(${users.handle}) = lower(${value})`)
      .limit(1)
    return row?.clerkId ?? null
  }
  if (token.source === "challenge") {
    const [row] = await db
      .select({ clerkId: challenges.creatorClerkId })
      .from(challenges)
      .where(eq(challenges.slug, value))
      .limit(1)
    return row?.clerkId ?? null
  }
  if (token.source === "anon") {
    // code → sharer session → account (if the sharer has signed up). When the
    // sharer hasn't signed up yet this returns null and the edge is deferred.
    const session = await resolveAnonCodeSession(value)
    return session ? clerkIdForSession(session) : null
  }
  return null
}

export type AttributionResult =
  | { recorded: true; source: ReferralSource }
  | { recorded: false; reason: "no_token" | "unresolved" | "self" | "exists" }

/**
 * Record a pending referral edge at onboarding. First-touch: the unique index on
 * referee_clerk_id makes a second attribution a no-op. Self-referral is blocked.
 */
export async function recordPendingReferral(input: {
  refereeClerkId: string
  token: ReferralToken | null | undefined
  /** The referee's current anon session — used to block same-device self-referral. */
  refereeSessionId?: string | null
}): Promise<AttributionResult> {
  const { refereeClerkId, token, refereeSessionId } = input
  if (!token || !token.value) return { recorded: false, reason: "no_token" }

  // Anon shares (PUN-119): the referrer may not have an account yet. Resolve the
  // code to the sharer's session; if it maps to an account, record a normal edge,
  // otherwise PARK it keyed by referee and stitch when the sharer signs up.
  if (token.source === "anon") {
    const sharerSession = await resolveAnonCodeSession(token.value)
    if (!sharerSession) return { recorded: false, reason: "unresolved" }
    // Self-referral: the sharer opening their own link on the same device.
    if (refereeSessionId && sharerSession === refereeSessionId)
      return { recorded: false, reason: "self" }

    const referrerClerkId = await clerkIdForSession(sharerSession)
    if (referrerClerkId) {
      if (referrerClerkId === refereeClerkId)
        return { recorded: false, reason: "self" }
      const inserted = await db
        .insert(referrals)
        .values({ referrerClerkId, refereeClerkId, source: "anon", status: "pending" })
        .onConflictDoNothing({ target: referrals.refereeClerkId })
        .returning({ id: referrals.id })
      if (inserted.length === 0) return { recorded: false, reason: "exists" }
      return { recorded: true, source: "anon" }
    }
    // Sharer has no account yet → defer.
    const parked = await db
      .insert(pendingAnonReferrals)
      .values({ refereeClerkId, referrerSessionId: sharerSession })
      .onConflictDoNothing({ target: pendingAnonReferrals.refereeClerkId })
      .returning({ refereeClerkId: pendingAnonReferrals.refereeClerkId })
    if (parked.length === 0) return { recorded: false, reason: "exists" }
    return { recorded: true, source: "anon" }
  }

  // Challenge links (PUN-123): the creator may be anonymous (no account yet).
  // Resolve to their account if it exists, otherwise PARK by the creator's
  // session and stitch when they sign up — mirroring the anon-share path so a
  // friction-free anon creator still earns the referral on their return leg.
  if (token.source === "challenge") {
    const [ch] = await db
      .select({
        creatorClerkId: challenges.creatorClerkId,
        creatorSessionId: challenges.creatorSessionId,
      })
      .from(challenges)
      .where(eq(challenges.slug, token.value))
      .limit(1)
    if (!ch) return { recorded: false, reason: "unresolved" }
    if (ch.creatorClerkId) {
      if (ch.creatorClerkId === refereeClerkId)
        return { recorded: false, reason: "self" }
      const inserted = await db
        .insert(referrals)
        .values({
          referrerClerkId: ch.creatorClerkId,
          refereeClerkId,
          source: "challenge",
          status: "pending",
        })
        .onConflictDoNothing({ target: referrals.refereeClerkId })
        .returning({ id: referrals.id })
      return inserted.length === 0
        ? { recorded: false, reason: "exists" }
        : { recorded: true, source: "challenge" }
    }
    if (ch.creatorSessionId) {
      if (refereeSessionId && ch.creatorSessionId === refereeSessionId)
        return { recorded: false, reason: "self" }
      const parked = await db
        .insert(pendingAnonReferrals)
        .values({ refereeClerkId, referrerSessionId: ch.creatorSessionId })
        .onConflictDoNothing({ target: pendingAnonReferrals.refereeClerkId })
        .returning({ refereeClerkId: pendingAnonReferrals.refereeClerkId })
      return parked.length === 0
        ? { recorded: false, reason: "exists" }
        : { recorded: true, source: "challenge" }
    }
    return { recorded: false, reason: "unresolved" }
  }

  const referrerClerkId = await resolveReferrer(token)
  if (!referrerClerkId) return { recorded: false, reason: "unresolved" }
  if (referrerClerkId === refereeClerkId)
    return { recorded: false, reason: "self" }

  const inserted = await db
    .insert(referrals)
    .values({
      referrerClerkId,
      refereeClerkId,
      source: token.source,
      status: "pending",
    })
    .onConflictDoNothing({ target: referrals.refereeClerkId })
    .returning({ id: referrals.id })

  if (inserted.length === 0) return { recorded: false, reason: "exists" }
  return { recorded: true, source: token.source }
}

/**
 * Stitch deferred anon referrals when a sharer signs up (PUN-119). Also writes a
 * 0-XP session→account link (idempotent) so the session is resolvable even when
 * the sharer banked no XP — closing the "sharer signs up before referee" gap.
 * Called from the handle-claim path with the user's current anon session.
 */
export async function stitchAnonReferralsOnSignup(
  clerkId: string,
  sessionId: string | null
): Promise<number> {
  if (!sessionId) return 0
  // Guarantee a session→account link exists (resolveReferrer relies on it).
  await db
    .insert(anonXpClaims)
    .values({ sessionId, clerkId, xpClaimed: 0 })
    .onConflictDoNothing({ target: anonXpClaims.sessionId })

  const parked = await db
    .select({ refereeClerkId: pendingAnonReferrals.refereeClerkId })
    .from(pendingAnonReferrals)
    .where(eq(pendingAnonReferrals.referrerSessionId, sessionId))
  let stitched = 0
  for (const p of parked) {
    if (p.refereeClerkId === clerkId) continue // never self-refer
    const inserted = await db
      .insert(referrals)
      .values({
        referrerClerkId: clerkId,
        refereeClerkId: p.refereeClerkId,
        source: "anon",
        status: "pending",
      })
      .onConflictDoNothing({ target: referrals.refereeClerkId })
      .returning({ id: referrals.id })
    if (inserted.length > 0) stitched += 1
    await db
      .delete(pendingAnonReferrals)
      .where(eq(pendingAnonReferrals.refereeClerkId, p.refereeClerkId))
  }
  return stitched
}

export type ShareCarrier = { param: "i" | "r"; value: string }

/**
 * The referral carrier to append to a share URL (PUN-119). Signed-in sharers get
 * their handle invite (`?i=`); anon sharers get a minted opaque code (`?r=`), so
 * every share is attributable.
 */
export const getShareCarrierFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShareCarrier | null> => {
    const clerkId = await callerClerkId()
    if (clerkId) {
      const [u] = await db
        .select({ handle: users.handle })
        .from(users)
        .where(eq(users.clerkId, clerkId))
        .limit(1)
      if (u?.handle) return { param: "i", value: u.handle }
    }
    const session = getServerSessionId()
    if (!session) return null
    const code = await mintAnonReferralCode(session)
    return code ? { param: "r", value: code } : null
  }
)

/** Pre-signup "X friends joined from your link" tease for an anon sharer (PUN-119). */
export const getAnonReferralTeaseFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ joined: number }> => {
    const session = getServerSessionId()
    if (!session) return { joined: 0 }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pendingAnonReferrals)
      .where(eq(pendingAnonReferrals.referrerSessionId, session))
    return { joined: Number(count) }
  }
)

export type ConfirmResult =
  | {
      confirmed: true
      referrerClerkId: string
      referrerXp: number
      refereeXp: number
      capped: boolean
    }
  | { confirmed: false }

/** Start of the current UTC day, for the per-referrer daily cap window. */
const utcDayStart = sql`date_trunc('day', now())`

/**
 * Confirm a referee's pending referral when they earn their first correct answer,
 * and pay both sides. Idempotent: once confirmed there is no pending row, so this
 * is a single indexed lookup that no-ops for everyone else. The referrer reward
 * is zeroed (edge still confirmed) when the referrer is over their daily cap.
 *
 * `cfg` is passed in by the XP grant caller (avoids a circular import with xp.ts).
 */
export async function confirmReferralOnActivation(
  refereeClerkId: string,
  cfg: XpConfig
): Promise<ConfirmResult> {
  const [pending] = await db
    .select({ id: referrals.id, referrerClerkId: referrals.referrerClerkId })
    .from(referrals)
    .where(
      and(
        eq(referrals.refereeClerkId, refereeClerkId),
        eq(referrals.status, "pending")
      )
    )
    .limit(1)
  if (!pending) return { confirmed: false }

  // Daily cap: how many referrals has this referrer already had rewarded today?
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referrals)
    .where(
      and(
        eq(referrals.referrerClerkId, pending.referrerClerkId),
        eq(referrals.status, "confirmed"),
        sql`${referrals.confirmedAt} >= ${utcDayStart}`,
        sql`${referrals.referrerXp} > 0`
      )
    )
  const referrerXp = count >= cfg.referralDailyCap ? 0 : cfg.xpReferralReferrer
  const refereeXp = cfg.xpReferralReferee

  // Claim the row first (guarded transition) so concurrent grants can't double-pay.
  const claimed = await db
    .update(referrals)
    .set({
      status: "confirmed",
      confirmedAt: new Date(),
      referrerXp,
      refereeXp,
    })
    .where(and(eq(referrals.id, pending.id), eq(referrals.status, "pending")))
    .returning({ id: referrals.id })
  if (claimed.length === 0) return { confirmed: false } // lost the race

  if (referrerXp > 0) {
    await db
      .update(users)
      .set({ totalXp: sql`${users.totalXp} + ${referrerXp}` })
      .where(eq(users.clerkId, pending.referrerClerkId))
  }
  if (refereeXp > 0) {
    await db
      .update(users)
      .set({ totalXp: sql`${users.totalXp} + ${refereeXp}` })
      .where(eq(users.clerkId, refereeClerkId))
  }

  return {
    confirmed: true,
    referrerClerkId: pending.referrerClerkId,
    referrerXp,
    refereeXp,
    capped: referrerXp === 0,
  }
}

export type InviterResult =
  | { found: false }
  | { found: true; handle: string; imageUrl: string | null }

/** Resolve an inviter for the /i/$handle landing hero (PUN-73). Public, no auth. */
export const getInviterFn = createServerFn({ method: "GET" })
  .inputValidator((d: { handle: string }) => d)
  .handler(async ({ data }): Promise<InviterResult> => {
    const h = (data.handle ?? "").trim()
    if (!h) return { found: false }
    const [row] = await db
      .select({ handle: users.handle, imageUrl: users.imageUrl })
      .from(users)
      .where(sql`lower(${users.handle}) = lower(${h})`)
      .limit(1)
    if (!row?.handle) return { found: false }
    return { found: true, handle: row.handle, imageUrl: row.imageUrl }
  })

export type ReferralStats = {
  /** Confirmed referrals (rewarded or not). */
  confirmed: number
  /** Pending edges (signed up, not yet activated). */
  pending: number
}

/** Referral counts for a referrer — drives the profile stat + invite card. */
export async function getReferralStats(
  referrerClerkId: string
): Promise<ReferralStats> {
  const rows = await db
    .select({ status: referrals.status, count: sql<number>`count(*)::int` })
    .from(referrals)
    .where(eq(referrals.referrerClerkId, referrerClerkId))
    .groupBy(referrals.status)
  let confirmed = 0
  let pending = 0
  for (const r of rows) {
    if (r.status === "confirmed") confirmed = Number(r.count)
    else if (r.status === "pending") pending = Number(r.count)
  }
  return { confirmed, pending }
}

export type ReferralEntry = {
  handle: string
  xp: number
  seen: boolean
  confirmedAt: string
}
export type MyReferralsResult = {
  confirmed: number
  pending: number
  items: Array<ReferralEntry>
  /** Newly-confirmed (unseen) referrals — drive the in-app payoff (PUN-75). */
  newlyConfirmed: Array<{ handle: string; xp: number }>
}

/** Owner-only: confirmed referrals (referee handle + reward) + unseen ones for the payoff. */
export const getMyReferralsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyReferralsResult> => {
    const clerkId = await callerClerkId()
    if (!clerkId)
      return { confirmed: 0, pending: 0, items: [], newlyConfirmed: [] }

    const stats = await getReferralStats(clerkId)
    const rows = await db
      .select({
        handle: users.handle,
        xp: referrals.referrerXp,
        seenAt: referrals.seenAt,
        confirmedAt: referrals.confirmedAt,
      })
      .from(referrals)
      .innerJoin(users, eq(users.clerkId, referrals.refereeClerkId))
      .where(
        and(
          eq(referrals.referrerClerkId, clerkId),
          eq(referrals.status, "confirmed")
        )
      )
      .orderBy(desc(referrals.confirmedAt))
      .limit(50)

    const items: Array<ReferralEntry> = rows.map((r) => ({
      handle: r.handle ?? "",
      xp: r.xp,
      seen: r.seenAt !== null,
      confirmedAt: (r.confirmedAt ?? new Date()).toISOString(),
    }))
    const newlyConfirmed = rows
      .filter((r) => r.seenAt === null)
      .map((r) => ({ handle: r.handle ?? "", xp: r.xp }))

    return {
      confirmed: stats.confirmed,
      pending: stats.pending,
      items,
      newlyConfirmed,
    }
  }
)

/** Mark all of the caller's confirmed-but-unseen referrals as seen (PUN-75). Idempotent. */
export const markReferralsSeenFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true; marked: number }> => {
    const clerkId = await callerClerkId()
    if (!clerkId) return { ok: true, marked: 0 }
    const updated = await db
      .update(referrals)
      .set({ seenAt: sql`now()` })
      .where(
        and(
          eq(referrals.referrerClerkId, clerkId),
          eq(referrals.status, "confirmed"),
          isNull(referrals.seenAt)
        )
      )
      .returning({ id: referrals.id })
    return { ok: true, marked: updated.length }
  }
)
