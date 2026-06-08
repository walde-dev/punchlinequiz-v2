/**
 * Shared resolve/insert primitives for minting punchline rows.
 *
 * Extracted from `upsert.ts` so two callers can reuse the exact same artist
 * canonicalization, song resolution and dedup logic:
 *   - the web admin add-flow (`upsertBar`), which passes the app's lazy `db`;
 *   - the WHO DAT?! ingestion CLI (`scripts/ingest`), which passes its own
 *     `createDb(DATABASE_URL)` connection.
 *
 * The `db` handle is **injected** (never imported here) so this module stays
 * usable from a standalone `tsx` script with no app-server bootstrap. Only
 * dependency-light leaves are imported: Deezer artwork (pure fetch) and the
 * `slugify`/`normalizeLine` string helpers.
 */
import { and, eq, sql } from "drizzle-orm"
import { artists, punchlines, songs } from "@workspace/db"
import { normalizeLine, slugify } from "./admin"
import { searchArtist, searchTrack } from "./deezer"
import type { createDb } from "@workspace/db"

/** A drizzle handle — the app proxy and `createDb()` are structurally identical. */
export type IngestDb = ReturnType<typeof createDb>

type ArtistRow = typeof artists.$inferSelect
type SongRow = typeof songs.$inferSelect

/** Resolve an artist by name (case-insensitive) or slug; auto-create if missing. */
export async function resolveOrCreateArtist(
  db: IngestDb,
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
    if (attempt > 50) throw new Error("slug_collision: could not generate unique artist slug")
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

/**
 * Resolve a song for `(artistId, title)`; auto-create with Deezer artwork if
 * missing. `artworkArtistName` lets the caller search artwork under the full
 * track credit (e.g. the song's primary artist) while the row is still owned
 * by the correct quiz artist.
 */
export async function resolveOrCreateSong(
  db: IngestDb,
  input: {
    artistId: number
    title: string
    artworkArtistName: string
    album?: string | null
    releaseYear?: number | null
  },
): Promise<{ row: SongRow; created: boolean }> {
  const existing = (
    await db
      .select()
      .from(songs)
      .where(
        and(
          eq(songs.artistId, input.artistId),
          sql`lower(${songs.title}) = lower(${input.title})`,
        ),
      )
      .limit(1)
  )[0]
  if (existing) return { row: existing, created: false }

  const trackArt = await searchTrack(input.artworkArtistName, input.title)
  const [created] = await db
    .insert(songs)
    .values({
      artistId: input.artistId,
      title: input.title,
      album: input.album ?? null,
      albumArtUrl: trackArt?.albumArtUrl ?? null,
      artworkProvider: trackArt ? "deezer" : null,
      artworkTrackId: trackArt?.trackId ?? null,
      artworkAlbumId: trackArt?.albumId ?? null,
      releaseYear: input.releaseYear ?? null,
    })
    .returning()
  return { row: created, created: true }
}

/**
 * Return the id of an existing punchline whose normalized line matches `line`
 * for `songId`, or null. Mirrors the game's own whitespace/case folding so the
 * review queue never gets a duplicate of a bar that already exists.
 */
export async function findDuplicateLine(
  db: IngestDb,
  songId: number,
  line: string,
): Promise<number | null> {
  const normalized = normalizeLine(line)
  const existing = (
    await db
      .select({ id: punchlines.id })
      .from(punchlines)
      .where(
        and(
          eq(punchlines.songId, songId),
          sql`lower(regexp_replace(trim(${punchlines.line}), '\\s+', ' ', 'g')) = ${normalized}`,
        ),
      )
      .limit(1)
  )[0]
  return existing?.id ?? null
}

/**
 * Return the id of any existing punchline whose line matches `line` once both
 * are squashed to `[a-z0-9]` only (case/whitespace/punctuation/diacritic-fold).
 * Used by the ingest path: the same bar may resolve to a slightly different
 * song across runs/episodes, and re-extraction has minor OCR punctuation
 * variance, so dedup is global by line rather than scoped to one song. Both
 * sides apply identical folding so the comparison is consistent.
 */
export async function findDuplicateLineGlobal(db: IngestDb, line: string): Promise<number | null> {
  const squashed = line.toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (!squashed) return null
  const existing = (
    await db
      .select({ id: punchlines.id })
      .from(punchlines)
      .where(sql`regexp_replace(lower(${punchlines.line}), '[^a-z0-9]+', '', 'g') = ${squashed}`)
      .limit(1)
  )[0]
  return existing?.id ?? null
}

/** Validate that correct + two distractors are three distinct artist ids. */
export function assertDistinctArtists(
  correctId: number,
  distractor1Id: number,
  distractor2Id: number,
): void {
  if (distractor1Id === correctId || distractor2Id === correctId)
    throw new Error("distractor_conflict: distractors must differ from the correct artist")
  if (distractor1Id === distractor2Id)
    throw new Error("distractor_conflict: distractors must be two different artists")
}

/**
 * Insert a punchline. Uses the schema defaults `reviewed=false, active=true`
 * (the review-queue state) unless overridden — the same state manual and
 * contributor bars flow through. Caller must have run dedup first.
 */
export async function insertBar(
  db: IngestDb,
  input: {
    songId: number
    line: string
    distractor1Id: number
    distractor2Id: number
    perfectSolution?: Array<string>
    acceptableSolutions?: Array<Array<string>>
    /** Skip the review queue (set true only when the caller trusts the source). */
    reviewed?: boolean
  },
): Promise<typeof punchlines.$inferSelect> {
  const [bar] = await db
    .insert(punchlines)
    .values({
      songId: input.songId,
      line: input.line.trim(),
      perfectSolution: input.perfectSolution ?? [],
      acceptableSolutions: input.acceptableSolutions
        ? input.acceptableSolutions.map((arr) => arr.map((s) => s.trim()))
        : [],
      distractor1Id: input.distractor1Id,
      distractor2Id: input.distractor2Id,
      reviewed: input.reviewed ?? false,
    })
    .returning()
  return bar
}
