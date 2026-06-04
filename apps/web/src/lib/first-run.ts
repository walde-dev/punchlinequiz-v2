/**
 * First-run detection for the cold-open experience (PUN-96).
 *
 * "Has this device ever finished a bar?" is tracked in localStorage
 * (`pq.has_played`) AND mirrored to the `pq_played` cookie. The localStorage
 * flag is the client source of truth (instant, no round-trip); the cookie
 * mirror exists so the SSR loader can pick an easy starter bar for the very
 * FIRST bar — which is fetched before any client code runs (see `getRound`'s
 * `opening` path). Both are device-local and set after the first answer.
 *
 * A fresh incognito context reads as first-run, which is correct: it genuinely
 * is a new context. No PII, no account needed.
 */
const PLAYED_LS = "pq.has_played"
const PLAYED_COOKIE = "pq_played"

/** True when this device has never finished a bar. Client-only (false on SSR). */
export function isFirstRun(): boolean {
  if (typeof window === "undefined") return false
  try {
    if (window.localStorage.getItem(PLAYED_LS) === "1") return false
  } catch {
    /* storage disabled — fall through to cookie */
  }
  return !/(?:^|;\s*)pq_played=1/.test(document.cookie)
}

/** Mark the device as having played. Idempotent; safe to call repeatedly. */
export function markPlayed(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(PLAYED_LS, "1")
  } catch {
    /* storage disabled — cookie still records it */
  }
  document.cookie = `${PLAYED_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax`
}

// Mirrors track.ts (session id) + anonymous-xp-cta.tsx (CTA throttle). Kept as
// literals here so the admin reset tool can wipe all first-run state in one
// place without those modules exporting internals.
const SESSION_LS = "pq.session_id"
const SESSION_COOKIE = "pq_sid"
const ANON_CTA_COUNT = "pq_anon_cta_count"

/**
 * Reset ALL first-run / cold-open state so the onboarding flow can be replayed
 * (admin test tool, PUN-94..100). Clears the played flag + cookie and the
 * anon-CTA throttle, then ROTATES the anonymous session id — a fresh session
 * has no banked provisional XP and no claim, so the starter ramp, how-it-works
 * hint, XP pill and session-complete CTA all surface again from scratch.
 * Client-only.
 */
export function resetFirstRun(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(PLAYED_LS)
    window.localStorage.removeItem(SESSION_LS)
    window.sessionStorage.removeItem(ANON_CTA_COUNT)
  } catch {
    /* storage disabled — cookies below still get cleared */
  }
  document.cookie = `${PLAYED_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
  document.cookie = `${SESSION_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
}
