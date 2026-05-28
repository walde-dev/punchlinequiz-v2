/**
 * Handle validation — shared by the client picker (instant feedback) and the
 * server claim path (authoritative). ASCII-only by design: the charset regex
 * rejects all non-ASCII codepoints, which neutralizes Unicode-confusable
 * impersonation (e.g. Cyrillic "а" in "аdmin") for free.
 */

export const HANDLE_MIN = 3
export const HANDLE_MAX = 20
const CHARSET = /^[a-zA-Z0-9_]+$/

export type HandleRejection =
  | "too_short"
  | "too_long"
  | "charset"
  | "reserved"
  | "profane"

export type HandleCheck =
  | { ok: true; normalized: string }
  | { ok: false; reason: HandleRejection }

/** Lowercased key used for the case-insensitive uniqueness index. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Reserved handles — block impersonation of staff/system roles. Matched
 * against the normalized (lowercased) handle exactly. A couple of obvious
 * leet variants are included since they read as the real thing.
 */
const RESERVED = new Set([
  "admin",
  "adm1n",
  "administrator",
  "mod",
  "moderator",
  "support",
  "help",
  "staff",
  "team",
  "official",
  "system",
  "root",
  "owner",
  "punchline",
  "punchlinequiz",
  "pquiz",
  "null",
  "undefined",
  "anonymous",
])

/**
 * Profanity / slur substrings. Intentionally small and not exhaustive — a
 * first line of defense, not a guarantee. Covers DE/EN/TR given the audience.
 * Substring match on the normalized handle.
 */
const PROFANITY = [
  "fuck",
  "shit",
  "bitch",
  "nigger",
  "nigga",
  "faggot",
  "cunt",
  "rape",
  "nazi",
  "hitler",
  "hure",
  "fotze",
  "wichser",
  "schlampe",
  "missgeburt",
  "kanake",
  "neger",
  "amk",
  "orospu",
  "sik",
]

export function validateHandle(raw: string): HandleCheck {
  const normalized = normalizeHandle(raw)
  if (normalized.length < HANDLE_MIN) return { ok: false, reason: "too_short" }
  if (normalized.length > HANDLE_MAX) return { ok: false, reason: "too_long" }
  if (!CHARSET.test(normalized)) return { ok: false, reason: "charset" }
  if (RESERVED.has(normalized)) return { ok: false, reason: "reserved" }
  if (PROFANITY.some((bad) => normalized.includes(bad))) return { ok: false, reason: "profane" }
  return { ok: true, normalized }
}
