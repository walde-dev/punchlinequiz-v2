import { db } from "./db"
import { HttpError } from "./admin"
import {
  assertDistinctArtists,
  findDuplicateLine,
  insertBar,
  resolveOrCreateArtist as resolveArtistCore,
  resolveOrCreateSong,
} from "./ingest-core"
import type { artists } from "@workspace/db"

export type UpsertBarInput = {
  artist: string
  song: string
  line: string
  distractor1: string
  distractor2: string
  album?: string
  releaseYear?: number
  perfectSolution?: Array<string>
  acceptableSolutions?: Array<Array<string>>
}

export type UpsertResult = {
  punchlineId: number
  songId: number
  artistId: number
  distractor1Id: number
  distractor2Id: number
  created: {
    artist: boolean
    song: boolean
    distractor1: boolean
    distractor2: boolean
  }
  artwork: {
    artistExternalId: string | null
    trackId: string | null
    albumId: string | null
  }
}

type ArtistRow = typeof artists.$inferSelect

/**
 * Resolve an artist by name (case-insensitive) or slug; auto-create if missing.
 * Thin wrapper over the shared core bound to the app's `db` — kept for the
 * existing admin call sites (artists.ts).
 */
export async function resolveOrCreateArtist(
  name: string,
): Promise<{ row: ArtistRow; created: boolean }> {
  return resolveArtistCore(db, name)
}

/** Resolve or create artist + song, then insert a punchline. Throws HttpError 409 on dup line. */
export async function upsertBar(input: UpsertBarInput): Promise<UpsertResult> {
  const correct = await resolveArtistCore(db, input.artist)
  const d1 = await resolveArtistCore(db, input.distractor1)
  const d2 = await resolveArtistCore(db, input.distractor2)

  try {
    assertDistinctArtists(correct.row.id, d1.row.id, d2.row.id)
  } catch {
    throw new HttpError(
      400,
      "distractor_conflict",
      "Distractors must be two different artists, both different from the correct artist.",
    )
  }

  const song = await resolveOrCreateSong(db, {
    artistId: correct.row.id,
    title: input.song,
    artworkArtistName: correct.row.name,
    album: input.album ?? null,
    releaseYear: input.releaseYear ?? null,
  })

  const dupId = await findDuplicateLine(db, song.row.id, input.line)
  if (dupId) {
    throw new HttpError(409, "duplicate_line", "This bar already exists for this song.", {
      existingId: dupId,
    })
  }

  const bar = await insertBar(db, {
    songId: song.row.id,
    line: input.line,
    distractor1Id: d1.row.id,
    distractor2Id: d2.row.id,
    perfectSolution: input.perfectSolution,
    acceptableSolutions: input.acceptableSolutions,
  })

  return {
    punchlineId: bar.id,
    songId: song.row.id,
    artistId: correct.row.id,
    distractor1Id: d1.row.id,
    distractor2Id: d2.row.id,
    created: {
      artist: correct.created,
      song: song.created,
      distractor1: d1.created,
      distractor2: d2.created,
    },
    artwork: {
      artistExternalId: correct.row.artworkExternalId ?? null,
      trackId: song.row.artworkTrackId ?? null,
      albumId: song.row.artworkAlbumId ?? null,
    },
  }
}
