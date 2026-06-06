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
    if (
      (t.source === "invite" || t.source === "challenge" || t.source === "anon") &&
      typeof t.value === "string"
    ) {
      return { source: t.source, value: t.value }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Capture a referral carrier from the current URL (PUN-119): `?i=<handle>` for a
 * signed-in inviter, `?r=<code>` for an anon sharer. First-touch wins. Returns
 * the token only when it was NEWLY stored, so the caller can fire the
 * referral_landing_viewed event exactly once.
 */
export function captureReferralFromUrl(): ReferralToken | null {
  if (typeof window === "undefined") return null
  try {
    const params = new URLSearchParams(window.location.search)
    const invite = params.get("i")
    const code = params.get("r")
    const token: ReferralToken | null = invite
      ? { source: "invite", value: invite }
      : code
        ? { source: "anon", value: code }
        : null
    if (!token) return null
    const alreadyHad = !!window.localStorage.getItem(KEY)
    setReferralToken(token) // first-touch: won't overwrite an existing token
    return alreadyHad ? null : token
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
