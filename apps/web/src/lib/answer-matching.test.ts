import { describe, expect, it } from "vitest"
import {
  clozeAnswerMatches,
  normalizeClozeAnswer,
  normalizeTitle,
  songGuessMatches,
} from "./answer-matching"

describe("normalizeTitle", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeTitle("Café")).toBe("cafe")
    expect(normalizeTitle("Über Mörder")).toBe("uber morder")
  })

  it("expands ß to ss", () => {
    expect(normalizeTitle("Straße")).toBe("strasse")
  })

  it("turns & into 'und'", () => {
    expect(normalizeTitle("Bonez & RAF")).toBe("bonez und raf")
  })

  it("drops apostrophes and quote marks entirely", () => {
    expect(normalizeTitle("Don't")).toBe("dont")
    expect(normalizeTitle("„Intro“")).toBe("intro")
  })

  it("collapses punctuation and whitespace", () => {
    expect(normalizeTitle("  King!!  (2014) ")).toBe("king 2014")
  })
})

describe("normalizeClozeAnswer", () => {
  it("strips a single leading article", () => {
    expect(normalizeClozeAnswer("der Hund")).toBe("hund")
    expect(normalizeClozeAnswer("einen Hund")).toBe("hund")
    expect(normalizeClozeAnswer("'nen Hund")).toBe("hund")
  })

  it("keeps inner articles", () => {
    expect(normalizeClozeAnswer("die Maus die fliegt")).toBe("maus die fliegt")
  })

  it("does not strip when the article is the only word", () => {
    expect(normalizeClozeAnswer("die")).toBe("die")
  })
})

describe("clozeAnswerMatches", () => {
  it("matches across leading-article differences", () => {
    expect(clozeAnswerMatches("der Hund", ["Hund"])).toBe(true)
    expect(clozeAnswerMatches("Hund", ["ein Hund"])).toBe(true)
  })

  it("matches compound words regardless of spacing", () => {
    expect(clozeAnswerMatches("MediaMarkt", ["Media Markt"])).toBe(true)
    expect(clozeAnswerMatches("Media Markt", ["mediamarkt"])).toBe(true)
  })

  it("rejects wrong answers and empty guesses", () => {
    expect(clozeAnswerMatches("Katze", ["Hund"])).toBe(false)
    expect(clozeAnswerMatches("", ["Hund"])).toBe(false)
  })
})

describe("songGuessMatches", () => {
  it("ignores feat. / parenthetical tails on the canonical title", () => {
    expect(songGuessMatches("King", "King (feat. Farid Bang)")).toBe(true)
    expect(songGuessMatches("Mein Block", "Mein Block [Bonus]")).toBe(true)
  })

  it("forgives orthography differences", () => {
    expect(songGuessMatches("strasse", "Straße")).toBe(true)
  })

  it("rejects unrelated guesses and empty input", () => {
    expect(songGuessMatches("Etwas Anderes", "King")).toBe(false)
    expect(songGuessMatches("", "King")).toBe(false)
  })
})
