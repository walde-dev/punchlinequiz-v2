import { createServerFn } from "@tanstack/react-start"
import { gameEvents } from "@workspace/db"
import { db } from "./db"
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

/**
 * Client-side event logger. Fire-and-forget — never blocks UI.
 * Uses the TanStack server function; failures are swallowed silently so
 * tracking never breaks gameplay.
 */
export function logEvent(name: string, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return
  const sessionId = getSessionId()
  // Stamp admin/QA sessions so the analytics dashboard can filter them out.
  const enriched = isInternalSession() ? { ...props, internal: true } : props
  // Single choke point: every product event goes to BOTH sinks.
  //  1) PostHog (client SDK) — product analytics: funnels, retention, replay.
  //  2) recordEvent server fn — raw backup in the gameEvents DB + Axiom logs.
  // recordEvent intentionally does NOT re-send to PostHog (would double-count).
  capturePostHog(name, enriched)
  recordEvent({ data: { sessionId, name, props: enriched } }).catch(() => {})
}
