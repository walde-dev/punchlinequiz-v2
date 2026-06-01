import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { eq, sql } from "drizzle-orm"
import { users } from "@workspace/db"

import { getActor } from "./auth"
import { db } from "./db"
import { recordPendingReferral, type ReferralToken } from "./referral"
import { ensureUser } from "./xp"
import { validateHandle } from "./handle"
import type { HandleRejection } from "./handle"

export type OnboardingStatus =
  | { signedIn: false }
  | { signedIn: true; onboarded: boolean; handle: string | null }

/**
 * Onboarding status for the current Clerk user. Lazily creates the user row
 * (same `ensureUser` the XP grant path uses) so a freshly-signed-in user who
 * has never answered a bar still resolves cleanly.
 */
export const getOnboardingStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<OnboardingStatus> => {
    const req = getRequest()
    const result = await getActor(req)
    if (result?.actor.kind !== "clerk") return { signedIn: false }

    const clerkId = result.actor.userId
    await ensureUser(clerkId)
    // ensureUser guarantees the row exists.
    const [row] = await db
      .select({ handle: users.handle, onboardedAt: users.onboardedAt })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1)

    return {
      signedIn: true,
      onboarded: !!row.onboardedAt,
      handle: row.handle,
    }
  },
)

export type HandleCheckResult =
  | { available: true }
  | { available: false; reason: HandleRejection | "taken" }

/** Find the Clerk id currently holding a normalized handle, if any. */
async function ownerOfHandle(normalized: string): Promise<string | null> {
  const rows = await db
    .select({ clerkId: users.clerkId })
    .from(users)
    .where(sql`lower(${users.handle}) = ${normalized}`)
    .limit(1)
  return rows.length > 0 ? rows[0].clerkId : null
}

/**
 * Non-authoritative availability check for live feedback in the picker.
 * Validation still re-runs server-side in claim.
 */
export const checkHandleFn = createServerFn({ method: "POST" })
  .inputValidator((d: { handle: string }) => d)
  .handler(async ({ data }): Promise<HandleCheckResult> => {
    const check = validateHandle(data.handle)
    if (!check.ok) return { available: false, reason: check.reason }

    const req = getRequest()
    const result = await getActor(req)
    const callerId = result?.actor.kind === "clerk" ? result.actor.userId : null

    const owner = await ownerOfHandle(check.normalized)
    if (owner && owner !== callerId) return { available: false, reason: "taken" }
    return { available: true }
  })

export type ClaimHandleResult =
  | { ok: true; handle: string }
  | { ok: false; reason: HandleRejection | "taken" | "unauthorized" }

function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  // Postgres unique_violation = 23505; neon-http surfaces it in the message.
  return msg.includes("23505") || msg.includes("users_handle_lower_uq") || msg.includes("duplicate key")
}

/**
 * Authoritative handle claim. Sets handle + onboardedAt on the caller's row.
 * The lower(handle) unique index is the source of truth for collisions:
 * - A different user holding the handle → UPDATE raises 23505 → "taken".
 * - The caller re-submitting their own handle is a no-op (same row, same
 *   value), so double-tap never reports a false "taken".
 */
export const claimHandleFn = createServerFn({ method: "POST" })
  .inputValidator((d: { handle: string; referral?: ReferralToken }) => d)
  .handler(async ({ data }): Promise<ClaimHandleResult> => {
    const req = getRequest()
    const result = await getActor(req)
    if (result?.actor.kind !== "clerk") return { ok: false, reason: "unauthorized" }
    const clerkId = result.actor.userId

    const check = validateHandle(data.handle)
    if (!check.ok) return { ok: false, reason: check.reason }

    await ensureUser(clerkId)

    // Whether this claim is the user's FIRST onboarding — referral attribution
    // only applies to brand-new users, never a returning re-claim.
    const [before] = await db
      .select({ onboardedAt: users.onboardedAt })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1)
    const isFirstOnboarding = !before?.onboardedAt

    // Store the trimmed display form; uniqueness is enforced on lower(handle).
    const display = data.handle.trim()

    try {
      await db
        .update(users)
        .set({ handle: display, onboardedAt: new Date() })
        .where(eq(users.clerkId, clerkId))
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Confirm it's really someone else (not a self re-claim that raced).
        const owner = await ownerOfHandle(check.normalized)
        if (owner && owner === clerkId) return { ok: true, handle: display }
        return { ok: false, reason: "taken" }
      }
      throw err
    }

    // Attribute a referral (first-touch) for genuinely new users only. Never let
    // a referral hiccup fail the handle claim.
    if (isFirstOnboarding && data.referral) {
      await recordPendingReferral({ refereeClerkId: clerkId, token: data.referral }).catch(() => {})
    }

    return { ok: true, handle: display }
  })
