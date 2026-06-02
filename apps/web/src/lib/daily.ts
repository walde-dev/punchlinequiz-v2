import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { and, eq, inArray, lte } from "drizzle-orm"
import { artists, dailyChallenges, punchlines, songs, users } from "@workspace/db"

import { db } from "./db"
import { getActor } from "./auth"
import { normalizeTitle } from "./game"
import { grantDailyArtist, grantDailySong, type XpGrantResult } from "./xp"

async function getClerkIdOrNull(): Promise<string | null> {
  try {
    const req = getRequest()
    const result = await getActor(req)
    if (result?.actor.kind === "clerk") return result.actor.userId
  } catch {
    /* not in request scope */
  }
  return null
}

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
  /** Contributor handle if this bar came from a submission (PUN-67); null = admin-authored. */
  submittedByHandle: string | null
}

export type DailyArtistGuessResult = {
  isCorrect: boolean
  correctArtist: DailyArtistChoice
  xp: XpGrantResult | null
}

export type DailySongGuessResult = {
  isCorrect: boolean
  song: {
    title: string
    album: string | null
    albumArtUrl: string | null
    releaseYear: number | null
  }
  xp: XpGrantResult | null
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

async function loadScheduledDailyAnswer(date: string, punchlineId: number) {
  const rows = await db
    .select({
      correctArtistId: songs.artistId,
      artistName: artists.name,
      artistImageUrl: artists.imageUrl,
      title: songs.title,
      album: songs.album,
      albumArtUrl: songs.albumArtUrl,
      releaseYear: songs.releaseYear,
    })
    .from(dailyChallenges)
    .innerJoin(punchlines, eq(punchlines.id, dailyChallenges.punchlineId))
    .innerJoin(songs, eq(songs.id, punchlines.songId))
    .innerJoin(artists, eq(artists.id, songs.artistId))
    .where(and(eq(dailyChallenges.date, date), eq(dailyChallenges.punchlineId, punchlineId)))
    .limit(1)
  return rows[0] ?? null
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
        submittedByHandle: users.handle,
      })
      .from(dailyChallenges)
      .innerJoin(punchlines, eq(punchlines.id, dailyChallenges.punchlineId))
      .innerJoin(songs, eq(songs.id, punchlines.songId))
      .innerJoin(artists, eq(artists.id, songs.artistId))
      .leftJoin(users, eq(users.clerkId, punchlines.submittedByClerkId))
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
      submittedByHandle: row.submittedByHandle ?? null,
    }
  })

/**
 * Validate the artist guess for a daily punchline. The client passes an
 * artistId picked from the 3 choices returned by getDailyChallenge.
 */
export const submitDailyArtistGuess = createServerFn({ method: "POST" })
  .inputValidator((d: { punchlineId: number; artistId: number; date: string }) => d)
  .handler(async ({ data }): Promise<DailyArtistGuessResult> => {
    if (!isValidIsoDate(data.date)) throw new Error("Invalid daily date")
    const r = await loadScheduledDailyAnswer(data.date, data.punchlineId)
    if (!r) throw new Error("Daily challenge not found")
    const isCorrect = r.correctArtistId === data.artistId
    let xp: XpGrantResult | null = null
    const clerkId = await getClerkIdOrNull()
    if (clerkId) {
      xp = await grantDailyArtist({ clerkId, date: data.date, isCorrect })
    }
    return {
      isCorrect,
      correctArtist: {
        id: r.correctArtistId,
        name: r.artistName,
        imageUrl: r.artistImageUrl,
      },
      xp,
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
  .inputValidator((d: { punchlineId: number; guess: string; date: string }) => d)
  .handler(async ({ data }): Promise<DailySongGuessResult> => {
    if (!isValidIsoDate(data.date)) throw new Error("Invalid daily date")
    const r = await loadScheduledDailyAnswer(data.date, data.punchlineId)
    if (!r) throw new Error("Daily challenge not found")
    const g = normalizeTitle((data.guess ?? "").trim())
    const isCorrect = g.length > 0 && titleCandidates(r.title).some((c) => c === g)
    let xp: XpGrantResult | null = null
    const clerkId = await getClerkIdOrNull()
    if (clerkId) {
      xp = await grantDailySong({ clerkId, date: data.date, isCorrect })
    }
    return {
      isCorrect,
      song: {
        title: r.title,
        album: r.album,
        albumArtUrl: r.albumArtUrl,
        releaseYear: r.releaseYear,
      },
      xp,
    }
  })
