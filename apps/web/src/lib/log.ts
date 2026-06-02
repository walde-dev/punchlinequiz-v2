import { getRequest } from "@tanstack/react-start/server"

import { forwardToAxiom } from "./axiom"
import { notifyError } from "./discord-rest"

/**
 * Server-side structured logging. Two outputs, both keyed by `session_id`:
 *  1. `console` as structured JSON — picked up by the Vercel → Axiom log drain.
 *  2. A direct Axiom ingest (env-gated) so logs land even before the drain is
 *     enabled / in environments without it.
 *
 * Keep this for info/warn/error only (no debug spam) to respect the Axiom free
 * tier. Exceptions are captured by Sentry separately (global middleware +
 * route errorComponent); use this for intentional, structured server events.
 */
export type LogLevel = "info" | "warn" | "error"

/**
 * Read the anonymous `session_id` from the `pq_sid` cookie on the active
 * request. Mirrors the client localStorage id (see `getSessionId` in
 * `track.ts`). Returns null outside a request context or when unset.
 */
export function getServerSessionId(): string | null {
  try {
    const cookie = getRequest().headers.get("cookie")
    if (!cookie) return null
    const match = cookie.match(/(?:^|;\s*)pq_sid=([^;]+)/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    // No active request (e.g. build/SSR module scope) — nothing to read.
    return null
  }
}

/**
 * Emit a structured server log line. `session_id` is auto-attached from the
 * request cookie when available; pass it explicitly to override (e.g. when the
 * id is known but the request context isn't accessible).
 */
export function logServer(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
  sessionId?: string
): void {
  const record = {
    level,
    event,
    session_id: sessionId ?? getServerSessionId() ?? undefined,
    timestamp: new Date().toISOString(),
    ...fields,
  }

  // 1) structured console — drained to Axiom by Vercel
  const line = JSON.stringify(record)
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)

  // 2) direct Axiom ingest (no-op unless AXIOM_TOKEN/AXIOM_DATASET set)
  forwardToAxiom([record])

  // 3) push errors to the #alerts staff channel (fire-and-forget; no-op unless
  // DISCORD_ALERTS_CHANNEL_ID is set). notifyError logs its own failures to
  // console, never back through here, so there's no recursion.
  if (level === "error") notifyError(record)
}
