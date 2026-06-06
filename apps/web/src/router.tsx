import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
// Side-effect: client-side Sentry init (no-op unless VITE_SENTRY_DSN is set).
import "./lib/sentry.client"
// Side-effect: kick off client-side PostHog init (no-op unless
// VITE_PUBLIC_POSTHOG_KEY is set; SSR-guarded so it stays out of the server bundle).
import { loadPostHog } from "./lib/posthog"
// Recover from stale lazy-chunk imports after a deploy (reload once).
import { installPreloadErrorRecovery } from "./lib/preload-recovery"
import { getSessionId } from "./lib/session-id"

if (!import.meta.env.SSR) {
  // Mint the canonical anonymous session id BEFORE anything async so PostHog
  // boots with it as distinctID (see session-id.ts). Synchronous + idempotent;
  // guarantees pre-signup play and the eventual signup share one identity.
  getSessionId()
  void loadPostHog()
  installPreloadErrorRecovery()
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
