// One-shot backfill: resolve Deezer artwork for artists + songs that don't
// have it yet. Idempotent — re-runnable; rows with an existing
// artwork_external_id / artwork_track_id are skipped.
//
// Usage: pnpm tsx packages/db/src/backfill-artwork.ts
// Or:    DATABASE_URL=... pnpm tsx packages/db/src/backfill-artwork.ts

import { eq, isNull } from "drizzle-orm"
import { createDb } from "./index"
import { artists, songs } from "./schema"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required")
}

const db = createDb(process.env.DATABASE_URL)
const SLEEP_MS = 150
const API_BASE = "https://api.deezer.com"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function realImage(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null
  if (url.includes("/images/artist//")) return null
  if (url.includes("/images/cover//")) return null
  if (url.includes("/images/album//")) return null
  return url
}

function pickArtistImage(a: Record<string, unknown>): string | null {
  return (
    realImage(a.picture_xl) ??
    realImage(a.picture_big) ??
    realImage(a.picture_medium) ??
    realImage(a.picture)
  )
}

function pickAlbumImage(a: Record<string, unknown>): string | null {
  return (
    realImage(a.cover_xl) ??
    realImage(a.cover_big) ??
    realImage(a.cover_medium) ??
    realImage(a.cover)
  )
}

async function deezer<T>(path: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}${path}`)
      if (res.status === 429) {
        await sleep(Math.min(500 * 2 ** (attempt - 1), 5000))
        continue
      }
      if (!res.ok) return null
      const body = (await res.json()) as Record<string, unknown>
      if (body && typeof body === "object" && "error" in body && body.error) {
        const err = body.error as { code?: number }
        if (err.code === 4 || err.code === 700) {
          await sleep(Math.min(500 * 2 ** (attempt - 1), 5000))
          continue
        }
        return null
      }
      return body as T
    } catch {
      await sleep(Math.min(500 * 2 ** (attempt - 1), 5000))
    }
  }
  return null
}

async function searchArtist(name: string) {
  const body = await deezer<{ data?: Array<Record<string, unknown>> }>(
    `/search/artist?q=${encodeURIComponent(name)}&limit=1`,
  )
  const hit = body?.data?.[0]
  if (!hit) return null
  return {
    id: String(hit.id),
    imageUrl: pickArtistImage(hit),
  }
}

async function searchTrack(artistName: string, title: string) {
  const q = `artist:"${artistName}" track:"${title}"`
  let body = await deezer<{ data?: Array<Record<string, unknown>> }>(
    `/search?q=${encodeURIComponent(q)}&limit=1`,
  )
  if (!body?.data?.length) {
    body = await deezer<{ data?: Array<Record<string, unknown>> }>(
      `/search?q=${encodeURIComponent(`${artistName} ${title}`)}&limit=1`,
    )
  }
  const hit = body?.data?.[0]
  if (!hit) return null
  const album = (hit.album as Record<string, unknown> | undefined) ?? {}
  return {
    trackId: String(hit.id),
    albumId: String(album.id ?? ""),
    albumArtUrl: pickAlbumImage(album),
  }
}

async function backfillArtists() {
  const rows = await db
    .select({ id: artists.id, name: artists.name })
    .from(artists)
    .where(isNull(artists.artworkExternalId))

  console.log(`Artists to resolve: ${rows.length}`)
  let hits = 0
  for (const row of rows) {
    const match = await searchArtist(row.name)
    if (match) {
      await db
        .update(artists)
        .set({
          imageUrl: match.imageUrl,
          artworkProvider: "deezer",
          artworkExternalId: match.id,
        })
        .where(eq(artists.id, row.id))
      hits += 1
      console.log(`  ✓ ${row.name} → ${match.id}${match.imageUrl ? "" : " (no image)"}`)
    } else {
      console.log(`  ✗ ${row.name} (no match)`)
    }
    await sleep(SLEEP_MS)
  }
  console.log(`Artists: ${hits}/${rows.length} resolved`)
}

async function backfillSongs() {
  const rows = await db
    .select({
      id: songs.id,
      title: songs.title,
      artistName: artists.name,
    })
    .from(songs)
    .innerJoin(artists, eq(artists.id, songs.artistId))
    .where(isNull(songs.artworkTrackId))

  console.log(`Songs to resolve: ${rows.length}`)
  let hits = 0
  for (const row of rows) {
    const match = await searchTrack(row.artistName, row.title)
    if (match) {
      await db
        .update(songs)
        .set({
          albumArtUrl: match.albumArtUrl,
          artworkProvider: "deezer",
          artworkTrackId: match.trackId,
          artworkAlbumId: match.albumId || null,
        })
        .where(eq(songs.id, row.id))
      hits += 1
      console.log(
        `  ✓ ${row.artistName} — ${row.title} → ${match.trackId}${match.albumArtUrl ? "" : " (no image)"}`,
      )
    } else {
      console.log(`  ✗ ${row.artistName} — ${row.title} (no match)`)
    }
    await sleep(SLEEP_MS)
  }
  console.log(`Songs: ${hits}/${rows.length} resolved`)
}

async function main() {
  await backfillArtists()
  await backfillSongs()
  console.log("Backfill complete.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
