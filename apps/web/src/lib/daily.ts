import { createServerFn } from "@tanstack/react-start"
import { eq, inArray, lte } from "drizzle-orm"
import { artists, dailyChallenges, punchlines, songs } from "@workspace/db"

import { db } from "./db"
import { normalizeTitle } from "./game"

export type DailyArtistChoice = {
  id: number
  name: string
  imageUrl: string | null
}

export type DailyChallenge = {
  /** ISO date YYYY-MM-DD this bar is featured on. */
  date: string
  /** Sequential index from the very first daily — used for share text. */
  number: number
  punchlineId: number
  line: string
  /** Correct artist + two distractors, shuffled. */
  choices: DailyArtistChoice[]
  album: string | null
  albumArtUrl: string | null
  releaseYear: number | null
  artistImageUrl: string | null
}

export type DailyArtistGuessResult = {
  isCorrect: boolean
  correctArtist: DailyArtistChoice
}

export type DailySongGuessResult = {
  isCorrect: boolean
  song: {
    title: string
    album: string | null
    albumArtUrl: string | null
    releaseYear: number | null
  }
}

/** Today's date in Europe/Berlin (CET/CEST) as YYYY-MM-DD. */
function todayCET(): string {
  // sv-SE locale formats as YYYY-MM-DD by default.
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
}

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
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
 * Fetch the daily challenge for a given date (default: today CET). Returns
 * null when no daily is scheduled for that date.
 *
 * `number` is the sequential index of the daily (1-based, in date order). Used
 * for share text like "punchline/quiz daily #47".
 */
export const getDailyChallenge = createServerFn({ method: "GET" })
  .inputValidator((d: { date?: string } | undefined) => d ?? {})
  .handler(async ({ data }): Promise<DailyChallenge | null> => {
    const date = data.date && isValidIsoDate(data.date) ? data.date : todayCET()

    const rows = await db
      .select({
        date: dailyChallenges.date,
        punchlineId: punchlines.id,
        line: punchlines.line,
        album: songs.album,
        albumArtUrl: songs.albumArtUrl,
        releaseYear: songs.releaseYear,
        correctArtistId: artists.id,
        artistImageUrl: artists.imageUrl,
        distractor1Id: punchlines.distractor1Id,
        distractor2Id: punchlines.distractor2Id,
      })
      .from(dailyChallenges)
      .innerJoin(punchlines, eq(punchlines.id, dailyChallenges.punchlineId))
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .innerJoin(artists, eq(artists.id, songs.artistId))
      .where(eq(dailyChallenges.date, date))
      .limit(1)

    if (rows.length === 0) return null
    const row = rows[0]

    const numberRows = await db
      .select({ id: dailyChallenges.id })
      .from(dailyChallenges)
      .where(lte(dailyChallenges.date, date))
    const number = numberRows.length

    const ids = [row.correctArtistId, row.distractor1Id, row.distractor2Id]
    const artistRows = await db
      .select({ id: artists.id, name: artists.name, imageUrl: artists.imageUrl })
      .from(artists)
      .where(inArray(artists.id, ids))
    const byId = new Map(artistRows.map((a) => [a.id, a]))
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((x): x is DailyArtistChoice => Boolean(x))

    return {
      date: row.date,
      number,
      punchlineId: row.punchlineId,
      line: row.line,
      choices: shuffle(ordered),
      album: row.album,
      albumArtUrl: row.albumArtUrl,
      releaseYear: row.releaseYear,
      artistImageUrl: row.artistImageUrl,
    }
  })

/**
 * Validate the artist guess for a daily punchline. The client passes an
 * artistId picked from the 3 choices returned by getDailyChallenge.
 */
export const submitDailyArtistGuess = createServerFn({ method: "POST" })
  .inputValidator((d: { punchlineId: number; artistId: number }) => d)
  .handler(async ({ data }): Promise<DailyArtistGuessResult> => {
    const rows = await db
      .select({
        correctArtistId: songs.artistId,
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
    }
  })

function titleCandidates(title: string): string[] {
  const variants = new Set<string>()
  variants.add(title)
  variants.add(title.replace(/[([{][^)\]}]*[)\]}]/g, ""))
  variants.add(title.replace(/\s+(feat\.?|ft\.?|featuring)\s.+$/i, ""))
  variants.add(title.replace(/\s+(prod\.?|produced)\s.+$/i, ""))
  return Array.from(variants).map(normalizeTitle).filter(Boolean)
}

/**
 * Validate the song guess for a daily. Empty string = skip (counts as wrong
 * but still reveals the answer). Always returns the canonical song row so the
 * client can render the final wordle grid + reveal.
 */
export const submitDailySongGuess = createServerFn({ method: "POST" })
  .inputValidator((d: { punchlineId: number; guess: string }) => d)
  .handler(async ({ data }): Promise<DailySongGuessResult> => {
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
    const g = normalizeTitle((data.guess ?? "").trim())
    const isCorrect = g.length > 0 && titleCandidates(r.title).some((c) => c === g)
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
