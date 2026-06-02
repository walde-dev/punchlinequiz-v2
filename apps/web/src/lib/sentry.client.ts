import { getSessionId } from "./track"

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
 */
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

if (!import.meta.env.SSR && dsn) {
  // @sentry/tanstackstart-react client entry re-exports the browser SDK; the
  // SSR guard above keeps this whole block out of the server bundle.
  void import("@sentry/tanstackstart-react").then((Sentry) => {
    Sentry.init({
      dsn,
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
    Sentry.setTag("session_id", getSessionId())
  })
}
