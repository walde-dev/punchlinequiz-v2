import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm"
import { artists, punchlines, songs } from "@workspace/db"
import { db } from "./db"

export type ArtistTile = {
  id: number
  slug: string
  name: string
  imageUrl: string | null
  punchlineCount: number
}

/**
 * List artists with playable punchlines. Optionally filter to cloze-eligible
 * lines (cloze_prompt authored + cloze_enabled) so the finishing-lines
 * picker only surfaces artists that can actually be played in that mode.
 */
export const listPlayableArtists = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { mode?: "artist" | "cloze" } | undefined) => d ?? {},
  )
  .handler(async ({ data }): Promise<ArtistTile[]> => {
    const punchlineConds = [eq(punchlines.active, true)]
    if (data.mode === "cloze") {
      punchlineConds.push(isNotNull(punchlines.clozePrompt))
      punchlineConds.push(eq(punchlines.clozeEnabled, true))
    }
    const rows = await db
      .select({
        id: artists.id,
        slug: artists.slug,
        name: artists.name,
        imageUrl: artists.imageUrl,
        punchlineCount: sql<number>`count(${punchlines.id})::int`,
      })
      .from(artists)
      .innerJoin(songs, eq(songs.artistId, artists.id))
      .innerJoin(punchlines, and(eq(punchlines.songId, songs.id), ...punchlineConds))
      .where(eq(artists.active, true))
      .groupBy(artists.id)
      .orderBy(sql`count(${punchlines.id}) desc`, artists.name)

    return rows
  },
)

export type ArtistChoice = {
  id: number
  name: string
  imageUrl: string | null
}

export type SongChoice = {
  id: number
  title: string
  album: string | null
  albumArtUrl: string | null
  releaseYear: number | null
}

/**
 * Classic mode: full bar shown, 3 artist choices. The user guesses who wrote
 * the bar, then free-types the song.
 *
 * Cloze mode (artist-filtered URL): artist is already known. The bar is shown
 * with its final word(s) blanked out and the user free-types the completion,
 * then free-types the song. Lines without a cloze_prompt authored are
 * excluded from this mode.
 */
export type Round =
  | {
      mode: "artist"
      punchlineId: number
      line: string
      choices: ArtistChoice[]
    }
  | {
      mode: "cloze"
      punchlineId: number
      line: string // the cloze prompt (with ___)
      artist: ArtistChoice
    }

export type ArtistContext = {
  id: number
  slug: string
  name: string
  imageUrl: string | null
  punchlineCount: number
}

/** Look up a single artist by slug for the artist-mode header. */
export const getArtistContext = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }): Promise<ArtistContext | null> => {
    const rows = await db
      .select({
        id: artists.id,
        slug: artists.slug,
        name: artists.name,
        imageUrl: artists.imageUrl,
        punchlineCount: sql<number>`count(${punchlines.id})::int`,
      })
      .from(artists)
      .leftJoin(songs, eq(songs.artistId, artists.id))
      .leftJoin(
        punchlines,
        and(eq(punchlines.songId, songs.id), eq(punchlines.active, true)),
      )
      .where(eq(artists.slug, data.slug))
      .groupBy(artists.id)
      .limit(1)
    return rows[0] ?? null
  })

export type SongReveal = {
  title: string
  album: string | null
  albumArtUrl: string | null
  releaseYear: number | null
}

export type AnswerResult = {
  isCorrect: boolean
  correctArtist: ArtistChoice
  // Only present when the artist guess was WRONG — the round is over so we
  // can show the full answer. When the artist guess is correct, the client
  // must call submitSongGuess (or skip) to reveal the song.
  song: SongReveal | null
}

export type SongGuessResult = {
  isCorrect: boolean
  song: SongReveal
}

export type ClozeGuessResult = {
  isCorrect: boolean
  /** Canonical answer to reveal to the user (the first perfect_solution). */
  correctAnswer: string
  /** Full bar line with the blank filled in — for the reveal display. */
  fullLine: string
  correctArtist: ArtistChoice
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

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
export function clozeAnswerMatches(guess: string, accepted: readonly string[]): boolean {
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
function titleCandidates(title: string): string[] {
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

function songGuessMatches(guess: string, title: string): boolean {
  const g = normalizeTitle(guess)
  if (!g) return false
  return titleCandidates(title).some((c) => c === g)
}

/**
 * Fetch one random active punchline.
 *
 * `mode` is the primary discriminator: "artist" → classic 3-choice round;
 * "cloze" → finishing-lines round (line with `___`, free-typed completion;
 * filtered to cloze-eligible punchlines). `artistSlug` is orthogonal — it
 * narrows either mode to a single artist when present.
 */
export const getRound = createServerFn({ method: "GET" })
  .inputValidator(
    (
      d:
        | { excludeId?: number; artistSlug?: string; mode?: "artist" | "cloze" }
        | undefined,
    ) => d ?? {},
  )
  .handler(async ({ data }): Promise<Round> => {
    const mode = data.mode ?? "artist"
    const conds = [eq(punchlines.active, true)]
    if (data.excludeId) conds.push(ne(punchlines.id, data.excludeId))
    if (data.artistSlug) conds.push(eq(artists.slug, data.artistSlug))
    if (mode === "cloze") {
      conds.push(isNotNull(punchlines.clozePrompt))
      conds.push(eq(punchlines.clozeEnabled, true))
    }

    const baseRows = await db
      .select({
        punchlineId: punchlines.id,
        line: punchlines.line,
        clozePrompt: punchlines.clozePrompt,
        artistId: songs.artistId,
        distractor1Id: punchlines.distractor1Id,
        distractor2Id: punchlines.distractor2Id,
      })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .innerJoin(artists, eq(artists.id, songs.artistId))
      .where(and(...conds))
      .orderBy(sql`random()`)
      .limit(1)

    if (baseRows.length === 0) {
      throw new Error(
        mode === "cloze"
          ? "No cloze-ready punchlines available"
          : "No punchlines available",
      )
    }
    const row = baseRows[0]

    if (mode === "cloze" && row.clozePrompt) {
      const artistRow = await db
        .select({ id: artists.id, name: artists.name, imageUrl: artists.imageUrl })
        .from(artists)
        .where(eq(artists.id, row.artistId))
        .limit(1)
      return {
        mode: "cloze",
        punchlineId: row.punchlineId,
        line: row.clozePrompt,
        artist: artistRow[0] ?? { id: row.artistId, name: "", imageUrl: null },
      }
    }

    const ids = [row.artistId, row.distractor1Id, row.distractor2Id]
    const rows = await db
      .select({ id: artists.id, name: artists.name, imageUrl: artists.imageUrl })
      .from(artists)
      .where(inArray(artists.id, ids))

    const byId = new Map(rows.map((r) => [r.id, r]))
    const ordered = ids.map((id) => byId.get(id)).filter((x): x is ArtistChoice => Boolean(x))

    return {
      mode: "artist",
      punchlineId: row.punchlineId,
      line: row.line,
      choices: shuffle(ordered),
    }
  })

/**
 * Validate the artist guess. When the guess is correct we deliberately do NOT
 * return song/album info — the client moves to the song-guessing phase and
 * has to call submitSongGuess to reveal it.
 */
export const submitAnswer = createServerFn({ method: "POST" })
  .inputValidator((d: { punchlineId: number; artistId: number }) => d)
  .handler(async ({ data }): Promise<AnswerResult> => {
    const rows = await db
      .select({
        correctArtistId: songs.artistId,
        songTitle: songs.title,
        album: songs.album,
        albumArtUrl: songs.albumArtUrl,
        releaseYear: songs.releaseYear,
        artistName: artists.name,
        artistImageUrl: artists.imageUrl,
      })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .innerJoin(artists, eq(artists.id, songs.artistId))
      .where(eq(punchlines.id, data.punchlineId))
      .limit(1)

    if (rows.length === 0) throw new Error("Punchline not found")
    const r = rows[0]
    const isCorrect = r.correctArtistId === data.artistId
    return {
      isCorrect,
      correctArtist: {
        id: r.correctArtistId,
        name: r.artistName,
        imageUrl: r.artistImageUrl,
      },
      // Wrong artist → round is over, show song. Right artist → withhold.
      song: isCorrect
        ? null
        : {
            title: r.songTitle,
            album: r.album,
            albumArtUrl: r.albumArtUrl,
            releaseYear: r.releaseYear,
          },
    }
  })

/**
 * Validate a free-typed cloze answer. Accepted answers live in
 * punchlines.perfect_solution (a list of full-answer strings). Matching is
 * lenient via the same normalizeTitle pipeline used for song titles.
 */
export const submitClozeGuess = createServerFn({ method: "POST" })
  .inputValidator((d: { punchlineId: number; guess: string }) => d)
  .handler(async ({ data }): Promise<ClozeGuessResult> => {
    const rows = await db
      .select({
        line: punchlines.line,
        perfectSolution: punchlines.perfectSolution,
        artistId: artists.id,
        artistName: artists.name,
        artistImageUrl: artists.imageUrl,
      })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .innerJoin(artists, eq(artists.id, songs.artistId))
      .where(eq(punchlines.id, data.punchlineId))
      .limit(1)

    if (rows.length === 0) throw new Error("Punchline not found")
    const r = rows[0]
    const guess = (data.guess ?? "").trim()
    const accepted = r.perfectSolution ?? []
    const isCorrect = clozeAnswerMatches(guess, accepted)
    return {
      isCorrect,
      correctAnswer: accepted[0] ?? "",
      fullLine: r.line,
      correctArtist: {
        id: r.artistId,
        name: r.artistName,
        imageUrl: r.artistImageUrl,
      },
    }
  })

/**
 * Validate a free-typed song guess. Empty string is treated as "skip" — the
 * reply still returns the song reveal but with isCorrect=false. The matching
 * is intentionally lenient (see normalizeTitle / titleCandidates).
 */
export const submitSongGuess = createServerFn({ method: "POST" })
  .inputValidator((d: { punchlineId: number; guess: string }) => d)
  .handler(async ({ data }): Promise<SongGuessResult> => {
    const rows = await db
      .select({
        title: songs.title,
        album: songs.album,
        albumArtUrl: songs.albumArtUrl,
        releaseYear: songs.releaseYear,
      })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .where(eq(punchlines.id, data.punchlineId))
      .limit(1)

    if (rows.length === 0) throw new Error("Punchline not found")
    const r = rows[0]
    const guess = (data.guess ?? "").trim()
    const isCorrect = guess.length > 0 && songGuessMatches(guess, r.title)
    return {
      isCorrect,
      song: {
        title: r.title,
        album: r.album,
        albumArtUrl: r.albumArtUrl,
        releaseYear: r.releaseYear,
      },
    }
  })
