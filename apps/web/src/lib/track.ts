import { createServerFn } from "@tanstack/react-start"
import { gameEvents } from "@workspace/db"
import { db } from "./db"
import { firstTouchSource } from "./acquisition"
import { forwardToAxiom } from "./axiom"
import { capturePostHog } from "./posthog"
import { getSessionId, uuid } from "./session-id"

export { getSessionId }

/**
 * Per-tab marker that the current player is an admin (QA playthroughs). When set,
 * every event carries `internal: true` so the admin analytics dashboard can
 * exclude our own sessions from per-line / per-artist rates. sessionStorage
 * (not localStorage) so it dies with the tab and never leaks onto a shared device.
 */
const INTERNAL_KEY = "pq.internal"

/** Fresh opaque id — used for per-round `attempt_id`s that group a round's events. */
export function newId(): string {
  return uuid()
}

/** Flag (or clear) the current tab as an internal/admin session. Client-only. */
export function setInternalSession(value: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (value) window.sessionStorage.setItem(INTERNAL_KEY, "1")
    else window.sessionStorage.removeItem(INTERNAL_KEY)
  } catch {
    /* storage disabled — best-effort only */
  }
}

function isInternalSession(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.sessionStorage.getItem(INTERNAL_KEY) === "1"
  } catch {
    return false
  }
}

/** Server function: persist event + forward to Axiom (if configured). */
export const recordEvent = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; name: string; props?: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    const props = data.props ?? {}

    // Stamp the signed-in Clerk id onto the event server-side. Client events are
    // keyed by the anon session UUID (which never changes after signup), so the
    // only other account link is anon_xp_claims — and a user who banked no XP at
    // signup has no claim row. `actor_user_id` closes that gap so every
    // authenticated action is directly attributable in the activity log.
    // Dynamic import keeps Clerk's server SDK out of the client bundle (track.ts
    // is also imported client-side for logEvent).
    const enriched: Record<string, unknown> = { ...props }
    if (enriched.actor_user_id == null) {
      try {
        const { auth } = await import("@clerk/tanstack-react-start/server")
        const session = await auth()
        if (session.isAuthenticated && session.userId) {
          enriched.actor_user_id = session.userId
        }
      } catch {
        // No auth context / not signed in — leave the event anonymous.
      }
    }

    // Persist to DB — fire-and-forget catch so analytics never block flow
    db.insert(gameEvents)
      .values({ sessionId: data.sessionId, name: data.name, props: enriched })
      .catch((e) => console.error("[track] db insert failed", e))

    forwardToAxiom([
      {
        event: data.name,
        session_id: data.sessionId,
        timestamp: new Date().toISOString(),
        ...enriched,
      },
    ])
    return { ok: true }
  })

/** Shared enrichment for both client loggers. */
function enrichProps(props: Record<string, unknown>): Record<string, unknown> {
  // Stamp the coarse first-touch acquisition bucket (PUN-121) on every event for
  // join-free "which channel converts" slicing. Distinct key `acq_source` so it
  // never collides with the `source` prop some events use for their own surface
  // (e.g. signup_prompt_shown source=pill|session_complete).
  const acqSource = firstTouchSource()
  const withSource =
    acqSource && props.acq_source == null ? { ...props, acq_source: acqSource } : props
  // Stamp admin/QA sessions so the analytics dashboard can filter them out.
  return isInternalSession() ? { ...withSource, internal: true } : withSource
}

/**
 * Client-side event logger. Fire-and-forget — never blocks UI.
 * Uses the TanStack server function; failures are swallowed silently so
 * tracking never breaks gameplay.
 */
export function logEvent(name: string, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return
  const sessionId = getSessionId()
  const enriched = enrichProps(props)
  // Single choke point: every product event goes to BOTH sinks.
  //  1) PostHog (client SDK) — product analytics: funnels, retention, replay.
  //  2) recordEvent server fn — raw backup in the gameEvents DB + Axiom logs.
  // recordEvent intentionally does NOT re-send to PostHog (would double-count).
  capturePostHog(name, enriched)
  recordEvent({ data: { sessionId, name, props: enriched } }).catch(() => {})
}

/**
 * Like {@link logEvent}, but resolves to whether the server fn round-trip
 * completed (`true`) or was cancelled/failed (`false`).
 *
 * For events that fire at a navigation boundary — e.g. `auth_session_active`
 * the instant Clerk flips `isSignedIn`, which coincides with Clerk's post-auth
 * page reload — the in-flight `recordEvent` POST is frequently cancelled by the
 * unload, so the event never reaches the DB. Callers use this ack to defer their
 * "already logged" guard until the write actually lands, so a cancelled fire
 * retries on the next (stable) page load instead of being suppressed forever.
 */
export function logEventAck(name: string, props: Record<string, unknown> = {}): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  const sessionId = getSessionId()
  const enriched = enrichProps(props)
  capturePostHog(name, enriched)
  return recordEvent({ data: { sessionId, name, props: enriched } }).then(
    () => true,
    () => false,
  )
}
