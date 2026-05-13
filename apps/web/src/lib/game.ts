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

export type AnswerResult = {
  isCorrect: boolean
  correctArtist: ArtistChoice
  song: {
    title: string
    album: string | null
    albumArtUrl: string | null
    releaseYear: number | null
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
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

/** Validate a guess against the DB-stored correct artist for a punchline. */
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
    return {
      isCorrect: r.correctArtistId === data.artistId,
      correctArtist: {
        id: r.correctArtistId,
        name: r.artistName,
        imageUrl: r.artistImageUrl,
      },
      song: {
        title: r.songTitle,
        album: r.album,
        albumArtUrl: r.albumArtUrl,
        releaseYear: r.releaseYear,
      },
    }
  })
