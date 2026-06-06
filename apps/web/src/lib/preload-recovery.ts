/**
 * Stale-chunk recovery after a deploy.
 *
 * Vite builds route code as content-hashed chunks. When a new version ships,
 * those filenames change; any tab still running the previous build references
 * chunk names that no longer exist on the CDN, so the next lazy route import
 * 404s with "Failed to fetch dynamically imported module" (see Sentry
 * PUNCHLINEQUIZ-4). Vite dispatches a cancelable `vite:preloadError` on `window`
 * when that happens — we reload once to pull the fresh build.
 *
 * Loop guard: we record the last reload time and refuse to reload again within
 * a short cooldown. So a stale chunk after a deploy recovers transparently, but
 * a build that is genuinely broken (chunk still 404s on the fresh load) fails
 * fast and lets the error surface to Sentry instead of trapping the user in a
 * reload loop. Because the guard is time-based (not a one-shot flag), a tab left
 * open across several deploys can recover from each one.
 *
 * Client-only; imported for side effects from router.tsx behind an SSR guard.
 */
import { logEvent } from "./track"

const RELOAD_TS_KEY = "pq.preload_reload_ts"
/** Two reloads closer than this ⇒ the fresh build is itself broken; stop. */
const RELOAD_COOLDOWN_MS = 10_000

export function installPreloadErrorRecovery(): void {
  if (typeof window === "undefined") return

  window.addEventListener("vite:preloadError", (event) => {
    const now = Date.now()
    let last = 0
    try {
      last = Number(window.sessionStorage.getItem(RELOAD_TS_KEY)) || 0
    } catch {
      /* storage disabled — treat as never-reloaded */
    }

    // Reloaded moments ago and still failing → broken build, not a stale chunk.
    // Don't preventDefault: let Vite rethrow so Sentry captures the real break.
    if (now - last < RELOAD_COOLDOWN_MS) return

    event.preventDefault()
    try {
      window.sessionStorage.setItem(RELOAD_TS_KEY, String(now))
    } catch {
      /* best-effort — reload anyway, worst case is one extra reload */
    }

    // Best-effort breadcrumb (the fetch may be cut short by the reload; the
    // underlying error is already captured by Sentry regardless).
    logEvent("chunk_reload", {
      module: (event as Event & { payload?: { message?: string } }).payload?.message ?? "",
    })

    window.location.reload()
  })
}
