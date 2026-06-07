/**
 * Client-side challenge helpers (PUN-123). The anon board name is captured once
 * and reused so a player only types it the first time they land on a board —
 * keeping the friction-free "create & send" promise. Pure localStorage; SSR-safe.
 */
const NAME_KEY = "pq.challenge.name"

export function readChallengeName(): string | null {
  if (typeof window === "undefined") return null
  try {
    const n = window.localStorage.getItem(NAME_KEY)?.trim()
    return n ? n.slice(0, 40) : null
  } catch {
    return null
  }
}

export function saveChallengeName(name: string): void {
  if (typeof window === "undefined") return
  try {
    const n = name.trim().slice(0, 40)
    if (n) window.localStorage.setItem(NAME_KEY, n)
  } catch {
    /* private mode / quota — best-effort */
  }
}
