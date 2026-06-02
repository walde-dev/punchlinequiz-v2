import { createServerFn } from "@tanstack/react-start"
import { gameEvents } from "@workspace/db"
import { db } from "./db"
import { forwardToAxiom } from "./axiom"
import { capturePostHog } from "./posthog"

const SESSION_KEY = "pq.session_id"
/** Cookie mirror of the session id, so server-side errors/logs can read it. */
const SESSION_COOKIE = "pq_sid"

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * Anonymous session id, persisted in localStorage AND mirrored into the
 * `pq_sid` cookie. Client-only. The cookie lets server functions, server logs,
 * and Sentry scope (see `sentry-scope.ts`) attach the same id the client uses,
 * so one session_id correlates across Sentry + Axiom + the gameEvents DB.
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

/** Server function: persist event + forward to Axiom (if configured). */
export const recordEvent = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; name: string; props?: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    const props = data.props ?? {}
    // Persist to DB — fire-and-forget catch so analytics never block flow
    db.insert(gameEvents)
      .values({ sessionId: data.sessionId, name: data.name, props })
      .catch((e) => console.error("[track] db insert failed", e))

    forwardToAxiom([
      {
        event: data.name,
        session_id: data.sessionId,
        timestamp: new Date().toISOString(),
        ...props,
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
  // Single choke point: every product event goes to BOTH sinks.
  //  1) PostHog (client SDK) — product analytics: funnels, retention, replay.
  //  2) recordEvent server fn — raw backup in the gameEvents DB + Axiom logs.
  // recordEvent intentionally does NOT re-send to PostHog (would double-count).
  capturePostHog(name, props)
  recordEvent({ data: { sessionId, name, props } }).catch(() => {})
}
