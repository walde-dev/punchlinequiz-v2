import type { ReferralToken } from "./referral"

/**
 * Client-side first-touch referral carrier (PUN-73). A token captured on an
 * /i/$handle or /c/$slug landing is stashed here and survives the Clerk modal
 * sign-up, then read at onboarding (claimHandleFn) and cleared. First-touch:
 * an existing token is never overwritten, so the original inviter wins.
 *
 * Type-only import of ReferralToken — erased at compile, so the server-only
 * referral.ts (and its db import) never reaches the client bundle.
 */
const KEY = "pq.referral.v1"

export function setReferralToken(token: ReferralToken): void {
  if (typeof window === "undefined") return
  try {
    if (window.localStorage.getItem(KEY)) return // first-touch wins
    window.localStorage.setItem(KEY, JSON.stringify(token))
  } catch {
    /* private mode / quota — referral is best-effort */
  }
}

export function getReferralToken(): ReferralToken | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as Partial<ReferralToken>
    if ((t.source === "invite" || t.source === "challenge") && typeof t.value === "string") {
      return { source: t.source, value: t.value }
    }
    return null
  } catch {
    return null
  }
}

export function clearReferralToken(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
