import { and, eq, sql } from "drizzle-orm"
import { artists, punchlines, songs } from "@workspace/db"
import { db } from "./db"
import { HttpError, normalizeLine, slugify } from "./admin"
import { searchArtist, searchTrack } from "./deezer"

export type UpsertBarInput = {
  artist: string
  song: string
  line: string
  distractor1: string
  distractor2: string
  album?: string
  releaseYear?: number
  perfectSolution?: string[]
  acceptableSolutions?: string[][]
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

/** Resolve an artist by name (case-insensitive) or slug; auto-create if missing. */
export async function resolveOrCreateArtist(
  name: string,
): Promise<{ row: ArtistRow; created: boolean }> {
  const slug = slugify(name)
  const existing = (
    await db
      .select()
      .from(artists)
      .where(sql`lower(${artists.name}) = lower(${name}) or ${artists.slug} = ${slug}`)
      .limit(1)
  )[0]
  if (existing) return { row: existing, created: false }

  let candidate = slug || `artist-${Date.now()}`
  let attempt = 0
  while (
    (await db.select().from(artists).where(eq(artists.slug, candidate)).limit(1)).length > 0
  ) {
    attempt += 1
    candidate = `${slug}-${attempt}`
    if (attempt > 50) throw new HttpError(500, "slug_collision", "Could not generate unique slug.")
  }
  const art = await searchArtist(name)
  const [created] = await db
    .insert(artists)
    .values({
      slug: candidate,
      name,
      imageUrl: art?.imageUrl ?? null,
      artworkProvider: art ? "deezer" : null,
      artworkExternalId: art?.id ?? null,
    })
    .returning()
  return { row: created, created: true }
}

/** Resolve or create artist + song, then insert a punchline. Throws HttpError 409 on dup line. */
export async function upsertBar(input: UpsertBarInput): Promise<UpsertResult> {
  const correct = await resolveOrCreateArtist(input.artist)
  const artistRow = correct.row
  const artistCreated = correct.created

  const d1 = await resolveOrCreateArtist(input.distractor1)
  const d2 = await resolveOrCreateArtist(input.distractor2)

  if (d1.row.id === artistRow.id || d2.row.id === artistRow.id) {
    throw new HttpError(
      400,
      "distractor_conflict",
      "Distractors must differ from the correct artist.",
    )
  }
  if (d1.row.id === d2.row.id) {
    throw new HttpError(400, "distractor_conflict", "Distractors must be two different artists.")
  }

  let songRow = (
    await db
      .select()
      .from(songs)
      .where(
        and(eq(songs.artistId, artistRow.id), sql`lower(${songs.title}) = lower(${input.song})`),
      )
      .limit(1)
  )[0]

  let songCreated = false
  if (!songRow) {
    const trackArt = await searchTrack(artistRow.name, input.song)
    const [created] = await db
      .insert(songs)
      .values({
        artistId: artistRow.id,
        title: input.song,
        album: input.album ?? null,
        albumArtUrl: trackArt?.albumArtUrl ?? null,
        artworkProvider: trackArt ? "deezer" : null,
        artworkTrackId: trackArt?.trackId ?? null,
        artworkAlbumId: trackArt?.albumId ?? null,
        releaseYear: input.releaseYear ?? null,
      })
      .returning()
    songRow = created
    songCreated = true
  }

  const normalized = normalizeLine(input.line)
  const existing = (
    await db
      .select({ id: punchlines.id })
      .from(punchlines)
      .where(
        and(
          eq(punchlines.songId, songRow.id),
          sql`lower(regexp_replace(trim(${punchlines.line}), '\\s+', ' ', 'g')) = ${normalized}`,
        ),
      )
      .limit(1)
  )[0]

  if (existing) {
    throw new HttpError(409, "duplicate_line", "This bar already exists for this song.", {
      existingId: existing.id,
    })
  }

  const [bar] = await db
    .insert(punchlines)
    .values({
      songId: songRow.id,
      line: input.line.trim(),
      perfectSolution: input.perfectSolution ?? [],
      acceptableSolutions: input.acceptableSolutions
        ? input.acceptableSolutions.map((arr) => arr.map((s) => s.trim()))
        : [],
      distractor1Id: d1.row.id,
      distractor2Id: d2.row.id,
    })
    .returning()

  return {
    punchlineId: bar.id,
    songId: songRow.id,
    artistId: artistRow.id,
    distractor1Id: d1.row.id,
    distractor2Id: d2.row.id,
    created: {
      artist: artistCreated,
      song: songCreated,
      distractor1: d1.created,
      distractor2: d2.created,
    },
    artwork: {
      artistExternalId: artistRow.artworkExternalId ?? null,
      trackId: songRow.artworkTrackId ?? null,
      albumId: songRow.artworkAlbumId ?? null,
    },
  }
}
