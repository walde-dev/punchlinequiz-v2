import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray, ne, sql } from "drizzle-orm"
import { artists, punchlines, songs } from "@workspace/db"
import { db } from "./db"

export type ArtistChoice = {
  id: number
  name: string
  imageUrl: string | null
}

export type Round = {
  punchlineId: number
  line: string
  choices: ArtistChoice[] // 3 artists, shuffled — exactly one is correct
}

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

/** Fetch one random active punchline + its 3 hardcoded artist choices, shuffled for display. */
export const getRound = createServerFn({ method: "GET" })
  .inputValidator((d: { excludeId?: number } | undefined) => d ?? {})
  .handler(async ({ data }): Promise<Round> => {
    // Random punchline. Optionally exclude a previous one to avoid immediate repeat.
    const baseRows = await db
      .select({
        punchlineId: punchlines.id,
        line: punchlines.line,
        artistId: songs.artistId,
        distractor1Id: punchlines.distractor1Id,
        distractor2Id: punchlines.distractor2Id,
      })
      .from(punchlines)
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .where(
        data.excludeId
          ? and(eq(punchlines.active, true), ne(punchlines.id, data.excludeId))
          : eq(punchlines.active, true),
      )
      .orderBy(sql`random()`)
      .limit(1)

    if (baseRows.length === 0) throw new Error("No punchlines available")
    const row = baseRows[0]

    const ids = [row.artistId, row.distractor1Id, row.distractor2Id]
    const rows = await db
      .select({ id: artists.id, name: artists.name, imageUrl: artists.imageUrl })
      .from(artists)
      .where(inArray(artists.id, ids))

    const byId = new Map(rows.map((r) => [r.id, r]))
    const ordered = ids.map((id) => byId.get(id)).filter((x): x is ArtistChoice => Boolean(x))

    return {
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
