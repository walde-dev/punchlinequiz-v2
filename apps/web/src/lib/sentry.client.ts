/**
 * Client-only Sentry init. Side-effect import from `router.tsx`.
 *
 * IMPORTANT: Sentry's server (Node) SDK cannot be bundled into the Nitro
 * server output (rollup chokes on its `export *` namespace re-exports) and this
 * nitro setup inlines all deps rather than shipping node_modules — so anything
 * statically importing `@sentry/*` server-side makes the deployed function 500.
 * We therefore load Sentry ONLY on the client, behind `import.meta.env.SSR` so
 * Vite dead-code-eliminates it from the server build entirely. Server-side
 * errors are captured as structured Axiom logs instead (see `log.ts`).
 *
 * Errors-only at launch: no tracing, no replay. session_id tag keeps client
 * errors correlated with Axiom + the gameEvents DB.
 *
 * Loaded LAZILY, off the critical path: the @sentry browser SDK is a ~460 KiB
 * chunk and monitoring must never compete with first paint. We defer the dynamic
 * import to `requestIdleCallback` (with a setTimeout fallback for Safari), so it
 * downloads only once the page is interactive and the main thread is free. Early
 * errors aren't lost — the root route's errorComponent imports Sentry on demand
 * to capture render failures (see __root.tsx).
 */
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

function initSentry() {
  // @sentry/tanstackstart-react client entry re-exports the browser SDK; the
  // SSR guard at the call site keeps this whole chunk out of the server bundle.
  void import("@sentry/tanstackstart-react").then((Sentry) => {
    Sentry.init({
      dsn,
      // First-party tunnel: ship envelopes through our own origin (a Vercel
      // rewrite forwards /ingest/s → the Sentry envelope endpoint) instead of
      // posting straight to *.ingest.de.sentry.io. The direct host is on
      // EasyPrivacy, so Brave Shields / uBlock silently drop it — which is
      // exactly why iOS-Brave crashes (the "can't select an answer" reports)
      // never reached us. Same-origin requests aren't blocked by standard
      // shields, so this restores error visibility for blocked clients. Reuses
      // the proven `/ingest` prefix that already carries PostHog.
      tunnel: "/ingest/s",
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
      release: import.meta.env.VITE_SENTRY_RELEASE,
      tracesSampleRate: 0,
      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications.",
        "Non-Error promise rejection captured",
        /AbortError/,
      ],
      denyUrls: [/extensions\//i, /^chrome-extension:\/\//i, /^moz-extension:\/\//i],
    })
    // Read the session id inline (do NOT import from track.ts — that statically
    // imports ./db, which would pull server-only code into the client bundle and
    // throw "DATABASE_URL is required" at load).
    try {
      const sid = window.localStorage.getItem("pq.session_id")
      if (sid) Sentry.setTag("session_id", sid)
    } catch {
      // localStorage unavailable — skip the tag.
    }
  })
}

if (!import.meta.env.SSR && dsn) {
  const ric = window.requestIdleCallback
  if (typeof ric === "function") {
    ric(initSentry, { timeout: 3000 })
  } else {
    // Safari (< 17) has no requestIdleCallback — fall back to a short macrotask
    // so init still lands after the first paint / hydration.
    window.setTimeout(initSentry, 2000)
  }
}
