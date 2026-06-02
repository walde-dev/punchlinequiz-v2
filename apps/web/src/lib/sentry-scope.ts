import { createMiddleware } from "@tanstack/react-start"
import { auth } from "@clerk/tanstack-react-start/server"
import * as Sentry from "@sentry/tanstackstart-react"

/**
 * Global request middleware that stamps the per-request Sentry scope with the
 * anonymous `session_id` (from the pq_sid cookie) and the Clerk user id when
 * signed in. Must be registered AFTER `sentryGlobalRequestMiddleware` so the
 * per-request isolation scope already exists (see `start.ts`).
 *
 * This is the join key: the same `session_id` then appears on Sentry events,
 * in Axiom logs (`log.ts`), and in the gameEvents DB — so an agent can pivot a
 * Sentry error to the full session timeline.
 */
function flowForPath(path: string): string | null {
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) return "admin"
  if (path.startsWith("/play") || path.startsWith("/c/")) return "challenge_play"
  if (path.startsWith("/daily") || path.startsWith("/submit")) return "daily_submit"
  return null
}

export const sentryScopeMiddleware = createMiddleware().server(async ({ request, next }) => {
  const cookie = request.headers.get("cookie")
  const match = cookie?.match(/(?:^|;\s*)pq_sid=([^;]+)/)
  const sessionId = match ? decodeURIComponent(match[1]) : undefined
  if (sessionId) Sentry.setTag("session_id", sessionId)

  // Tag the key flows for fast filtering (derived from the path, so no
  // per-route plumbing). play / challenge → challenge_play; daily & submit →
  // daily_submit; admin → admin.
  const flow = flowForPath(new URL(request.url).pathname)
  if (flow) Sentry.setTag("flow", flow)

  try {
    const session = await auth()
    if (session.isAuthenticated && session.userId) {
      Sentry.setUser({ id: session.userId })
    }
  } catch {
    // auth() unavailable for this request — leave user unset.
  }

  return next()
})
