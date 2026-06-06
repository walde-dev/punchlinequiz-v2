import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { challenges, referrals, users } from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import type { XpConfig } from "@workspace/db"

async function callerClerkId(): Promise<string | null> {
  const result = await getActor(getRequest())
  return result?.actor.kind === "clerk" ? result.actor.userId : null
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

export type ReferralSource = "invite" | "challenge"

/** A first-touch referral token carried from the landing page through sign-up. */
export type ReferralToken = { source: ReferralSource; value: string }

/** Resolve a token to the referrer's clerkId (handle for invite, slug→creator for challenge). */
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
}): Promise<AttributionResult> {
  const { refereeClerkId, token } = input
  if (!token || !token.value) return { recorded: false, reason: "no_token" }

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
