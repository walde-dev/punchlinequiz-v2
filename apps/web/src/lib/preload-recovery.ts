/**
 * Stale-deploy recovery.
 *
 * Vite builds route code as content-hashed chunks. When a new version ships,
 * those filenames change; any tab still running the previous build references
 * chunk names that no longer exist on the CDN. The next route navigation then
 * fails in one of a few shapes:
 *   - Vite fires a cancelable `vite:preloadError` (the clean case).
 *   - The dynamic import rejects and surfaces as an unhandled rejection / error
 *     event without `vite:preloadError` (cross-browser, navigation races).
 *   - The import resolves oddly and TanStack Router throws downstream while
 *     reading `.component`/`.element` off an undefined match — this hits the
 *     root errorComponent (see __root.tsx, Sentry PUNCHLINEQUIZ-7).
 *
 * All three are the same root cause: a tab spanning a deploy. We reload once to
 * pull the fresh build. Loop guard: we record the last reload time and refuse to
 * reload again within a cooldown — so a stale chunk recovers transparently, but
 * a build that is genuinely broken (still throwing on the fresh load) fails fast
 * and lets the error surface instead of trapping the user in a reload loop.
 * Time-based (not a one-shot flag) so a long-open tab recovers from each deploy.
 *
 * Client-only; installed from router.tsx behind an SSR guard.
 */
import { logEvent } from "./track"

const RELOAD_TS_KEY = "pq.stale_reload_ts"
/** Two reloads closer than this ⇒ the fresh build is itself broken; stop. */
const RELOAD_COOLDOWN_MS = 10_000

/**
 * Cross-browser signatures of a dynamic import / chunk that vanished after a
 * deploy. Reliable and specific — safe to act on from a global handler.
 */
const IMPORT_FAILURE_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload (CSS|stylesheet)|dynamically imported module/i

/**
 * The downstream TanStack Router symptom when a route module resolves to
 * undefined (`route.component` / `route.element` read off nothing). Generic
 * enough that we only trust it inside the route error boundary, never globally.
 */
const ROUTE_LOAD_SYMPTOM_RE = /reading '(component|element)'|'(component|element)' of undefined/i

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message
  }
  return ""
}

/** A vanished-chunk import failure — safe to detect anywhere. */
export function isImportFailure(err: unknown): boolean {
  return IMPORT_FAILURE_RE.test(messageOf(err))
}

/**
 * A route-load failure as seen from the router error boundary: either a clean
 * import failure or the undefined-route-module symptom. Only call this from the
 * boundary, where the error is already scoped to a route load/render.
 */
export function isStaleRouteLoad(err: unknown): boolean {
  const msg = messageOf(err)
  return IMPORT_FAILURE_RE.test(msg) || ROUTE_LOAD_SYMPTOM_RE.test(msg)
}

/**
 * One-shot, cooldown-guarded reload to pull the freshly-deployed build. Returns
 * true if a reload was triggered, false if suppressed by the cooldown (caller
 * should then let the error surface normally).
 */
export function recoverFromStaleDeploy(reason: string): boolean {
  if (typeof window === "undefined") return false

  const now = Date.now()
  let last = 0
  try {
    last = Number(window.sessionStorage.getItem(RELOAD_TS_KEY)) || 0
  } catch {
    /* storage disabled — treat as never-reloaded */
  }
  if (now - last < RELOAD_COOLDOWN_MS) return false

  try {
    window.sessionStorage.setItem(RELOAD_TS_KEY, String(now))
  } catch {
    /* best-effort — reload anyway, worst case is one extra reload */
  }

  // Best-effort breadcrumb (the fetch may be cut short by the reload).
  logEvent("chunk_reload", { reason })
  window.location.reload()
  return true
}

export function installPreloadErrorRecovery(): void {
  if (typeof window === "undefined") return

  // 1) Vite's own signal when a dynamic import 404s (the clean path).
  window.addEventListener("vite:preloadError", (event) => {
    if (recoverFromStaleDeploy("preload_error")) event.preventDefault()
  })

  // 2) Import failures that bubble up as unhandled rejections / error events
  //    without firing vite:preloadError. Gated to the specific import-failure
  //    signatures so we never reload on an unrelated runtime error.
  window.addEventListener("unhandledrejection", (event) => {
    if (isImportFailure(event.reason)) recoverFromStaleDeploy("unhandled_rejection")
  })
  window.addEventListener("error", (event) => {
    if (isImportFailure(event.error ?? event.message)) recoverFromStaleDeploy("error_event")
  })
}
