/**
 * Client-side anon play progress (PUN-118). Two small localStorage values that
 * drive the escalating 2nd-session signup gate and the handle-carry flow.
 *
 * SSR-safe: every accessor guards `window` and swallows private-mode / quota
 * errors — progress is best-effort, never a hard dependency of play.
 */

const SESSIONS_KEY = "pq.sessions_completed"
const DESIRED_HANDLE_KEY = "pq.desired_handle"

/** How many full runs this device has completed (persists across visits). */
export function getSessionsCompleted(): number {
  if (typeof window === "undefined") return 0
  try {
    const n = Number(window.localStorage.getItem(SESSIONS_KEY))
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/** Bump the completed-runs counter; returns the new value. */
export function incSessionsCompleted(): number {
  const next = getSessionsCompleted() + 1
  if (typeof window === "undefined") return next
  try {
    window.localStorage.setItem(SESSIONS_KEY, String(next))
  } catch {
    /* private mode / quota — best-effort */
  }
  return next
}

/** Handle the user typed pre-auth, carried through the Clerk sign-in round-trip. */
export function getDesiredHandle(): string | null {
  if (typeof window === "undefined") return null
  try {
    const v = window.localStorage.getItem(DESIRED_HANDLE_KEY)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export function setDesiredHandle(handle: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(DESIRED_HANDLE_KEY, handle)
  } catch {
    /* best-effort */
  }
}

export function clearDesiredHandle(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(DESIRED_HANDLE_KEY)
  } catch {
    /* best-effort */
  }
}
