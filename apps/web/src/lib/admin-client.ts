/**
 * Client-side helpers for the admin REST API. All calls go to /api/admin/*
 * and rely on the httpOnly `pquiz_admin` cookie for auth — no token in JS.
 */

export type BarRow = {
  id: number
  line: string
  active: boolean
  createdAt: string
  songId: number
  songTitle: string
  songAlbum: string | null
  releaseYear: number | null
  artistId: number
  artistName: string
  artistSlug: string
  distractor1Id: number
  distractor2Id: number
}

export type ArtistRow = {
  id: number
  name: string
  slug: string
  imageUrl: string | null
  active: boolean
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg = (body.message as string) || (body.error as string) || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}

export async function fetchBars(opts: {
  search?: string
  includeInactive?: boolean
  limit?: number
}): Promise<{ items: BarRow[]; total: number }> {
  const url = new URL("/api/admin/bars", window.location.origin)
  if (opts.search?.trim()) url.searchParams.set("search", opts.search.trim())
  if (opts.includeInactive) url.searchParams.set("includeInactive", "true")
  url.searchParams.set("limit", String(opts.limit ?? 100))
  const res = await fetch(url, { credentials: "same-origin" })
  return jsonOrThrow(res)
}

export async function fetchArtists(): Promise<{ items: ArtistRow[] }> {
  const res = await fetch("/api/admin/artists?includeInactive=true", {
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function createBar(input: {
  artist: string
  song: string
  line: string
  distractor1: string
  distractor2: string
  album?: string
  releaseYear?: number
}): Promise<{ punchlineId: number }> {
  const res = await fetch("/api/admin/bars", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function patchSong(
  id: number,
  patch: {
    title?: string
    album?: string | null
    releaseYear?: number
    artistId?: number
  },
): Promise<{ id: number; title: string; album: string | null }> {
  const res = await fetch(`/api/admin/songs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export async function patchBar(
  id: number,
  patch: {
    line?: string
    active?: boolean
    distractor1Id?: number
    distractor2Id?: number
  },
): Promise<BarRow> {
  const res = await fetch(`/api/admin/bars/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    credentials: "same-origin",
  })
  return jsonOrThrow(res)
}

export type DeezerArtistHit = {
  id: string
  name: string
  imageUrl: string | null
}

export type DeezerTrackHit = {
  trackId: string
  title: string
  artistName: string
  artistId: string
  albumId: string
  albumTitle: string
  albumArtUrl: string | null
  releaseYear: number | null
}

export async function searchDeezerArtists(q: string): Promise<DeezerArtistHit[]> {
  if (!q.trim()) return []
  const url = new URL("/api/admin/search/artists", window.location.origin)
  url.searchParams.set("q", q.trim())
  const res = await fetch(url, { credentials: "same-origin" })
  const body = await jsonOrThrow<{ items: DeezerArtistHit[] }>(res)
  return body.items
}

export async function getDeezerTrack(id: string): Promise<DeezerTrackHit | null> {
  const res = await fetch(`/api/admin/search/track/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
  })
  if (res.status === 404) return null
  const body = await jsonOrThrow<{
    trackId: string
    title: string
    artistName: string
    albumId: string
    albumTitle: string
    albumArtUrl: string | null
    releaseYear: number | null
  }>(res)
  return {
    trackId: body.trackId,
    title: body.title,
    artistName: body.artistName,
    artistId: "",
    albumId: body.albumId,
    albumTitle: body.albumTitle,
    albumArtUrl: body.albumArtUrl,
    releaseYear: body.releaseYear,
  }
}

export async function searchDeezerTracks(q: string): Promise<DeezerTrackHit[]> {
  if (!q.trim()) return []
  const url = new URL("/api/admin/search/tracks", window.location.origin)
  url.searchParams.set("q", q.trim())
  const res = await fetch(url, { credentials: "same-origin" })
  const body = await jsonOrThrow<{ items: DeezerTrackHit[] }>(res)
  return body.items
}

export async function deleteBar(id: number, hard = false): Promise<void> {
  const url = new URL(`/api/admin/bars/${id}`, window.location.origin)
  if (hard) url.searchParams.set("hard", "true")
  const res = await fetch(url, { method: "DELETE", credentials: "same-origin" })
  await jsonOrThrow(res)
}
