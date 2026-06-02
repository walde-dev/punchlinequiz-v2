/**
 * PostHog browser init + helpers. `loadPostHog()` is kicked off from `router.tsx`
 * at app boot; the capture/identify helpers are imported by isomorphic modules
 * (track.ts, analytics-identity.tsx) and no-op on the server.
 *
 * NOTE: deliberately NOT named `*.client.*`. TanStack Start's import-protection
 * forbids server-reachable code from importing `*.client.*` files, but these
 * helpers ARE called from isomorphic modules (logEvent in track.ts, the SSR-
 * rendered AnalyticsIdentity). Client-onlyness is instead guaranteed the same
 * way `sentry.client.ts` does it: the browser SDK loads ONLY via a dynamic
 * `import("posthog-js")` behind an `import.meta.env.SSR` early-return, so Vite
 * dead-code-eliminates it from the Nitro server bundle. The server talks to
 * PostHog over plain HTTP instead (see `posthog.server.ts`).
 *
 * Config decisions (see Linear PUN-40/41/42/45 + the grilled decision record):
 *  - api_host = "/ingest": first-party reverse proxy (vercel.json) to survive
 *    adblockers; ui_host points at the real dashboard for in-app links.
 *  - autocapture OFF, but $pageview/$pageleave ON — protects the 1M/mo free tier
 *    while still powering funnels/retention/paths. All product events are the
 *    ~40 hand-curated `logEvent` calls.
 *  - bootstrap.distinctID = the existing `pq.session_id` UUID, so PostHog shares
 *    one anonymous id with Axiom + Sentry + the gameEvents DB.
 *  - person_profiles "always": we deliberately capture identified profiles incl.
 *    PII (email/name/handle) — see project decision; no consent gate.
 *  - session replay ON with maskAllInputs — see PUN-45. Sampling / min-duration
 *    live in the PostHog project settings (see docs/posthog.md), not here.
 */
import type { PostHog } from "posthog-js"

const KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined
// UI host for dashboard deep-links (toolbar etc). Ingest is always proxied via
// /ingest, so this is only used for links, not for sending events.
const UI_HOST = (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ?? "https://eu.posthog.com"

/** Bootstrap flags injected by the root route loader (server-evaluated) so the
 *  first client render already knows variant assignments — no flag flicker.
 *  See `posthog.server.ts` + the root route loader. */
type Bootstrap = { featureFlags?: Record<string, string | boolean> }
function readBootstrap(): Bootstrap {
  try {
    const g = globalThis as unknown as { __PH_BOOTSTRAP__?: Bootstrap }
    return g.__PH_BOOTSTRAP__ ?? {}
  } catch {
    return {}
  }
}

function bootstrapDistinctId(): string | undefined {
  // Reuse the anonymous session UUID minted by track.ts. Read inline (do NOT
  // import track.ts — it statically pulls server-only ./db into the bundle).
  try {
    return window.localStorage.getItem("pq.session_id") ?? undefined
  } catch {
    return undefined
  }
}

let phPromise: Promise<PostHog | null> | null = null

/** Idempotent client init. Resolves to the PostHog instance, or null when
 *  disabled (SSR, no key, or load failure). */
export function loadPostHog(): Promise<PostHog | null> {
  if (phPromise) return phPromise
  if (import.meta.env.SSR || !KEY) {
    phPromise = Promise.resolve(null)
    return phPromise
  }
  const boot = readBootstrap()
  phPromise = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: "/ingest",
        ui_host: UI_HOST,
        // Modern defaults (history-based pageviews, sane persistence, etc).
        defaults: "2025-05-24",
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: true,
        person_profiles: "always",
        persistence: "localStorage+cookie",
        bootstrap: {
          distinctID: bootstrapDistinctId(),
          featureFlags: boot.featureFlags,
        },
        // Session replay (PUN-45): enabled; mask every input + all text so no
        // typed PII is ever recorded. Sampling/min-duration are project-side.
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
        },
        // Disable in dev so local clicking doesn't pollute prod analytics.
        loaded: (ph) => {
          if (import.meta.env.DEV) ph.opt_out_capturing()
        },
      })
      return posthog
    })
    .catch(() => null)
  return phPromise
}

/** Fire an event to PostHog. Fire-and-forget; no-op when disabled. */
export function capturePostHog(name: string, props: Record<string, unknown> = {}): void {
  void loadPostHog().then((ph) => ph?.capture(name, props))
}

/** Attach the identified user (PUN-42). Merges the current anonymous distinct
 *  id into the Clerk user. We deliberately attach PII (email/name) per project
 *  decision. */
export function identifyPostHog(userId: string, traits: Record<string, unknown> = {}): void {
  void loadPostHog().then((ph) => ph?.identify(userId, traits))
}

/** Reset identity on sign-out so the next user/anon on a shared device does NOT
 *  merge into the signed-out account (PUN-42). */
export function resetPostHog(): void {
  void loadPostHog().then((ph) => ph?.reset())
}

/** Read a (bootstrapped or live) feature flag value (PUN-44). */
export function getFeatureFlag(key: string): string | boolean | undefined {
  // Synchronous read once loaded; falls back to bootstrap before SDK resolves.
  const g = globalThis as unknown as { posthog?: PostHog }
  const live = g.posthog?.getFeatureFlag(key)
  if (live !== undefined) return live
  return readBootstrap().featureFlags?.[key]
}
