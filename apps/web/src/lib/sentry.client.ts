import * as Sentry from "@sentry/tanstackstart-react"

/**
 * Client-side Sentry init. Side-effect import from `router.tsx` so it runs once
 * during client bootstrap. No-op unless VITE_SENTRY_DSN is set, so dev/preview
 * run without a DSN.
 *
 * Errors-only at launch: tracesSampleRate is 0 (no perf/transaction volume to
 * spend the free-tier quota on) and no browser-tracing/replay integrations.
 * `session_id` is attached server-side via the request middleware
 * (see `sentry-scope.ts`); the client carries the same id in the pq_sid cookie.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

if (typeof document !== "undefined" && dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: 0,
    // Quota hygiene: drop common, un-actionable browser noise.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications.",
      "Non-Error promise rejection captured",
      /AbortError/,
    ],
    denyUrls: [/extensions\//i, /^chrome-extension:\/\//i, /^moz-extension:\/\//i],
  })
}
