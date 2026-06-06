/**
 * Canonical anonymous session id. Client-only, with NO server imports, so BOTH
 * the analytics logger (`track.ts`) and the PostHog client boot (`posthog.ts`)
 * can mint it without pulling the server-only `./db` into the browser bundle —
 * the reason `posthog.ts` deliberately avoids importing `track.ts`.
 *
 * This is the single anonymous identity shared across PostHog (bootstrap
 * `distinctID`), Axiom, Sentry scope, and the gameEvents DB. It MUST exist
 * before `posthog.init` runs so PostHog adopts it from the very first event.
 * Otherwise pre-signup anonymous play lands under a throwaway PostHog-minted id
 * that `identify()` never stitches onto the account — which silently drops all
 * pre-signup activity from the acquisition funnel (the bug this module fixes).
 */
const SESSION_KEY = "pq.session_id"
/** Cookie mirror of the session id, so server-side errors/logs can read it. */
const SESSION_COOKIE = "pq_sid"

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * Anonymous session id, minted on first call and persisted to localStorage AND
 * mirrored into the `pq_sid` cookie. Returns "ssr" on the server. Idempotent —
 * cheap to call eagerly at client boot to guarantee the id exists before
 * PostHog initialises.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr"
  let id = window.localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = uuid()
    window.localStorage.setItem(SESSION_KEY, id)
  }
  // Mirror to a long-lived cookie (idempotent — cheap to re-set each read).
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax`
  return id
}
