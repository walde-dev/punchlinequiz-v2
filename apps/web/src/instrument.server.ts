import * as Sentry from "@sentry/tanstackstart-react"

/**
 * Server-side Sentry init. Imported FIRST in `server.ts` so it runs before any
 * request is handled. No-op unless SENTRY_DSN is set.
 *
 * Errors-only at launch: tracesSampleRate 0 to protect the free-tier quota.
 * Per-request `session_id` / Clerk user scope is set by the global request
 * middleware (see `sentry-scope.ts`).
 */
const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
  })
}
