import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
// Side-effect: client-side Sentry init (no-op unless VITE_SENTRY_DSN is set).
import "./lib/sentry.client"
// Side-effect: kick off client-side PostHog init (no-op unless
// VITE_PUBLIC_POSTHOG_KEY is set; SSR-guarded so it stays out of the server bundle).
import { loadPostHog } from "./lib/posthog"

if (!import.meta.env.SSR) void loadPostHog()

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
