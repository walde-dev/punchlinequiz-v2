/**
 * Pure answer-matching / normalization logic for the game.
 *
 * This module is intentionally **side-effect free** — no DB, no server-fn,
 * no I/O imports. Keeping it isolated means the correctness core (how we
 * decide a typed guess is "right") is unit-testable in plain Node, with no
 * TanStack server-fn machinery to boot. See `answer-matching.test.ts`.
 *
 * `game.ts` re-exports the public functions, so existing imports of
 * `normalizeTitle` etc. from `./game` keep working.
 */

/**
 * Loose string normalization for free-typed song titles. Goal: forgive
 * realistic typos and orthography differences without accepting nonsense.
 * - lowercase, NFD-strip diacritics
 * - ß → ss
 * - common ampersand/word substitutions
 * - drop apostrophes & quote marks entirely (don't → dont)
 * - everything else non-alphanumeric → space; collapse whitespace
 */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[''`´‚‛ʼʹʻʽˈˊˋʼ’‘]/g, "")
    .replace(/[""„‟«»]/g, "")
    .replace(/\s*&\s*/g, " und ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Common German articles + rap-vernacular short forms that often prefix a
 * cloze noun. Stripped from the start of both guess and accepted answer so
 * "n Hund" / "nen Hund" / "ein Hund" / "einen Hund" / "der Hund" all match
 * a stored answer of "Hund" (and vice versa).
 *
 * Only the FIRST token is stripped — "die Maus die fliegt" keeps the inner
 * "die" alone. We also avoid stripping if the article is the only word, so
 * a one-word answer like "die" still works.
 */
const CLOZE_LEADING_ARTICLES = new Set([
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einen",
  "einem",
  "eines",
  "einer",
  // Rap-vernacular contractions: "'n", "'nen" → already apostrophe-stripped
  // upstream, so we see them as "n" / "nen".
  "n",
  "ne",
  "nen",
  // Definite plural / possessive-like fillers some users include.
  "die",
  "mein",
  "meine",
  "meinen",
])

/** Normalize a cloze guess: title-normalize, then strip a leading article. */
export function normalizeClozeAnswer(s: string): string {
  const t = normalizeTitle(s)
  if (!t) return t
  const tokens = t.split(" ")
  if (tokens.length > 1 && CLOZE_LEADING_ARTICLES.has(tokens[0])) {
    return tokens.slice(1).join(" ")
  }
  return t
}

/**
 * Whether a cloze guess matches one of the accepted answers. Accepts either:
 *   1. Direct normalized equality (after article-stripping), or
 *   2. Squashed equality — all internal whitespace removed. Catches the
 *      "Media Markt" vs "mediamarkt" / "MediaMarkt" class of compound-word
 *      mismatches where the spacing is a coin-flip and shouldn't fail an
 *      otherwise-correct answer.
 */
export function clozeAnswerMatches(
  guess: string,
  accepted: ReadonlyArray<string>
): boolean {
  const g = normalizeClozeAnswer(guess)
  if (!g) return false
  const gSquash = g.replace(/\s+/g, "")
  for (const a of accepted) {
    const n = normalizeClozeAnswer(a)
    if (!n) continue
    if (n === g) return true
    if (n.replace(/\s+/g, "") === gSquash) return true
  }
  return false
}

/** Build candidate normalized forms of the canonical title for matching. */
export function titleCandidates(title: string): Array<string> {
  const variants = new Set<string>()
  variants.add(title)
  // Strip parenthetical/bracketed segments: "(feat. X)", "[Bonus]", etc.
  variants.add(title.replace(/[([{][^)\]}]*[)\]}]/g, ""))
  // Strip "feat./ft./featuring …" tails
  variants.add(title.replace(/\s+(feat\.?|ft\.?|featuring)\s.+$/i, ""))
  // Strip "prod. by …" tails
  variants.add(title.replace(/\s+(prod\.?|produced)\s.+$/i, ""))
  return Array.from(variants).map(normalizeTitle).filter(Boolean)
}

/** Whether a free-typed song guess matches the canonical title (lenient). */
export function songGuessMatches(guess: string, title: string): boolean {
  const g = normalizeTitle(guess)
  if (!g) return false
  return titleCandidates(title).some((c) => c === g)
}
