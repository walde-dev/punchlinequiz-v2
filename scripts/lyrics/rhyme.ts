/**
 * German end-rhyme detection for couplet pairing.
 *
 * German rap punchlines are overwhelmingly AA-rhymed couplets: a setup line and
 * a payoff line whose final words rhyme. We approximate end-rhyme by comparing
 * the "rhyme tail" of each line's last word — the substring from the last vowel
 * group onward. This is a heuristic proxy for phonetic rhyme, tuned to be cheap
 * and good enough to let Claude make the final judgment.
 */

const VOWELS = "aeiouäöüy"

function lastWord(line: string): string {
  const words = line
    .toLowerCase()
    .replace(/[^a-zäöüß\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  return words[words.length - 1] ?? ""
}

/**
 * Rhyme tail: substring of `word` from the last vowel group onward.
 * "maus" → "aus", "kleiner" → "einer", "porsche" → "orsche" → "e" tail logic
 * keeps the final vowel-anchored chunk. Empty for vowel-less tokens.
 */
export function rhymeTail(word: string): string {
  const w = word.toLowerCase().replace(/[^a-zäöüß]/g, "")
  if (!w) return ""
  let lastVowel = -1
  for (let i = w.length - 1; i >= 0; i--) {
    if (VOWELS.includes(w[i]!)) {
      lastVowel = i
      // extend left across a contiguous vowel group (e.g. "au", "ei")
      while (lastVowel > 0 && VOWELS.includes(w[lastVowel - 1]!)) lastVowel--
      break
    }
  }
  if (lastVowel === -1) return w
  return w.slice(lastVowel)
}

/**
 * Rhyme score in [0,1] between two lines, based on their last words.
 *  1.0  — identical tails (clean rhyme), but not the identical word
 *  0.6  — one tail is a suffix of the other, overlap ≥ 2 (slant rhyme)
 *  0.0  — no meaningful overlap, or same word repeated
 */
export function rhymeScore(lineA: string, lineB: string): number {
  const wa = lastWord(lineA)
  const wb = lastWord(lineB)
  if (!wa || !wb) return 0
  if (wa === wb) return 0 // identical end word is repetition, not a rhyme

  const ta = rhymeTail(wa)
  const tb = rhymeTail(wb)
  if (!ta || !tb) return 0
  if (ta === tb) return 1

  const shorter = ta.length <= tb.length ? ta : tb
  const longer = ta.length <= tb.length ? tb : ta
  if (shorter.length >= 2 && longer.endsWith(shorter)) return 0.6

  // Same-length tails differing only in the final consonant (Geld/Welt,
  // Hand/Land-style slant rhymes common in German rap).
  if (ta.length === tb.length && ta.length >= 3 && ta.slice(0, -1) === tb.slice(0, -1)) {
    return 0.5
  }

  // shared suffix length as a last resort
  let shared = 0
  const min = Math.min(ta.length, tb.length)
  for (let i = 1; i <= min; i++) {
    if (ta[ta.length - i] === tb[tb.length - i]) shared++
    else break
  }
  return shared >= 2 ? 0.4 : 0
}
