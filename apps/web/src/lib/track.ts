import { createServerFn } from "@tanstack/react-start"
import { db } from "./db"
import { gameEvents } from "@workspace/db"

const SESSION_KEY = "pq.session_id"

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Anonymous session id, persisted in localStorage. Client-only. */
export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr"
  let id = window.localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = uuid()
    window.localStorage.setItem(SESSION_KEY, id)
  }
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

    const token = process.env.AXIOM_TOKEN
    const dataset = process.env.AXIOM_DATASET
    if (token && dataset) {
      const payload = [
        {
          event: data.name,
          session_id: data.sessionId,
          timestamp: new Date().toISOString(),
          ...props,
        },
      ]
      fetch(`https://api.axiom.co/v1/datasets/${dataset}/ingest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }).catch((e) => console.error("[track] axiom forward failed", e))
    }
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
  recordEvent({ data: { sessionId, name, props } }).catch(() => {})
}
