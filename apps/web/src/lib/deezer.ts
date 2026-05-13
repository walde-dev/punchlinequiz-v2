// Deezer Public API client. Free, no auth required.
// Used to resolve artwork (artist portraits + album/track covers) on admin bar
// add. Failures degrade gracefully to monogram fallback in the UI.

import { audit } from "./admin"

const API_BASE = "https://api.deezer.com"
const TIMEOUT_MS = 6000
const MAX_RETRIES = 5

export type DeezerArtistMatch = {
  id: string
  name: string
  imageUrl: string | null
}

export type DeezerTrackMatch = {
  trackId: string
  albumId: string
  title: string
  artistName: string
  albumArtUrl: string | null
}

// --- Internal helpers ---

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Token-prefix match: tolerate extra words, feature credits, etc. */
function nameMatches(query: string, candidate: string): boolean {
  const q = normalize(query)
  const c = normalize(candidate)
  if (!q || !c) return false
  if (c === q || c.startsWith(q) || q.startsWith(c)) return true
  const qTokens = q.split(" ")
  const cTokens = c.split(" ")
  // every query token appears in candidate tokens (order-insensitive)
  return qTokens.every((t) => cTokens.includes(t))
}

/** Deezer returns placeholder URLs (with `//` after `/images/<type>/`) when no
 * image exists. Treat those as null. */
function realImageOrNull(url: unknown): string | null {
  if (typeof url !== "string" || url.length === 0) return null
  if (url.includes("/images/artist//")) return null
  if (url.includes("/images/cover//")) return null
  if (url.includes("/images/album//")) return null
  return url
}

function pickArtistImage(a: Record<string, unknown>): string | null {
  return (
    realImageOrNull(a.picture_xl) ??
    realImageOrNull(a.picture_big) ??
    realImageOrNull(a.picture_medium) ??
    realImageOrNull(a.picture)
  )
}

function pickAlbumImage(a: Record<string, unknown>): string | null {
  return (
    realImageOrNull(a.cover_xl) ??
    realImageOrNull(a.cover_big) ??
    realImageOrNull(a.cover_medium) ??
    realImageOrNull(a.cover)
  )
}

async function deezerFetch(path: string): Promise<unknown> {
  let attempt = 0
  let lastErr: unknown = null
  while (attempt < MAX_RETRIES) {
    attempt += 1
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(`${API_BASE}${path}`, { signal: ac.signal })
      clearTimeout(t)
      if (res.status === 429) {
        const wait = Math.min(500 * 2 ** (attempt - 1), 5000)
        audit("artwork_rate_limited", { provider: "deezer", retry_after_ms: wait, attempt })
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      if (!res.ok) {
        throw new Error(`deezer http ${res.status}`)
      }
      const body = (await res.json()) as Record<string, unknown>
      // Deezer wraps errors in body.error rather than non-2xx.
      if (body && typeof body === "object" && "error" in body && body.error) {
        const err = body.error as { code?: number; message?: string }
        // code 4 = quota, code 700 = service busy — retryable
        if (err.code === 4 || err.code === 700) {
          const wait = Math.min(500 * 2 ** (attempt - 1), 5000)
          audit("artwork_rate_limited", { provider: "deezer", retry_after_ms: wait, attempt })
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        throw new Error(`deezer api error ${err.code}: ${err.message}`)
      }
      return body
    } catch (e) {
      clearTimeout(t)
      lastErr = e
      if (attempt >= MAX_RETRIES) break
      const wait = Math.min(500 * 2 ** (attempt - 1), 5000)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr ?? new Error("deezer fetch failed")
}

// --- Public surface ---

export async function searchArtist(name: string): Promise<DeezerArtistMatch | null> {
  audit("artwork_resolve_attempted", { provider: "deezer", kind: "artist", query: name })
  try {
    const body = (await deezerFetch(
      `/search/artist?q=${encodeURIComponent(name)}&limit=5`,
    )) as { data?: Array<Record<string, unknown>> }
    const hits = body.data ?? []
    const hit = hits.find((h) => nameMatches(name, String(h.name ?? ""))) ?? hits[0]
    if (!hit) {
      audit("artwork_resolve_miss", { provider: "deezer", kind: "artist", query: name })
      return null
    }
    const match: DeezerArtistMatch = {
      id: String(hit.id),
      name: String(hit.name),
      imageUrl: pickArtistImage(hit),
    }
    audit("artwork_resolve_hit", {
      provider: "deezer",
      kind: "artist",
      external_id: match.id,
      query: name,
    })
    return match
  } catch (e) {
    audit("artwork_resolve_failed", {
      provider: "deezer",
      kind: "artist",
      query: name,
      message: String(e),
    })
    return null
  }
}

export async function searchTrack(
  artistName: string,
  title: string,
): Promise<DeezerTrackMatch | null> {
  const q = `artist:"${artistName}" track:"${title}"`
  audit("artwork_resolve_attempted", { provider: "deezer", kind: "track", query: q })
  try {
    const body = (await deezerFetch(
      `/search?q=${encodeURIComponent(q)}&limit=5`,
    )) as { data?: Array<Record<string, unknown>> }
    let hits = body.data ?? []
    if (hits.length === 0) {
      // Fallback to a loose search; Deezer's strict syntax misses some entries.
      const loose = (await deezerFetch(
        `/search?q=${encodeURIComponent(`${artistName} ${title}`)}&limit=5`,
      )) as { data?: Array<Record<string, unknown>> }
      hits = loose.data ?? []
    }
    const hit =
      hits.find((h) => {
        const a = (h.artist as Record<string, unknown> | undefined)?.name
        return (
          nameMatches(artistName, String(a ?? "")) &&
          nameMatches(title, String(h.title ?? ""))
        )
      }) ?? hits[0]
    if (!hit) {
      audit("artwork_resolve_miss", { provider: "deezer", kind: "track", query: q })
      return null
    }
    const album = (hit.album as Record<string, unknown> | undefined) ?? {}
    const artist = (hit.artist as Record<string, unknown> | undefined) ?? {}
    const match: DeezerTrackMatch = {
      trackId: String(hit.id),
      albumId: String(album.id ?? ""),
      title: String(hit.title ?? title),
      artistName: String(artist.name ?? artistName),
      albumArtUrl: pickAlbumImage(album),
    }
    audit("artwork_resolve_hit", {
      provider: "deezer",
      kind: "track",
      external_id: match.trackId,
      album_id: match.albumId,
      query: q,
    })
    return match
  } catch (e) {
    audit("artwork_resolve_failed", {
      provider: "deezer",
      kind: "track",
      query: q,
      message: String(e),
    })
    return null
  }
}

export type DeezerTrackSearchHit = {
  trackId: string
  title: string
  artistName: string
  artistId: string
  albumId: string
  albumTitle: string
  albumArtUrl: string | null
  releaseYear: number | null
}

/** Live search for the admin combobox — multiple ranked candidates. */
export async function searchArtistsList(
  query: string,
  limit = 8,
): Promise<DeezerArtistMatch[]> {
  if (!query.trim()) return []
  try {
    const body = (await deezerFetch(
      `/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`,
    )) as { data?: Array<Record<string, unknown>> }
    return (body.data ?? []).map((a) => ({
      id: String(a.id),
      name: String(a.name ?? ""),
      imageUrl: pickArtistImage(a),
    }))
  } catch {
    return []
  }
}

export async function searchTracksList(
  query: string,
  limit = 8,
): Promise<DeezerTrackSearchHit[]> {
  if (!query.trim()) return []
  try {
    const body = (await deezerFetch(
      `/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    )) as { data?: Array<Record<string, unknown>> }
    return (body.data ?? []).map((h) => {
      const album = (h.album as Record<string, unknown> | undefined) ?? {}
      const artist = (h.artist as Record<string, unknown> | undefined) ?? {}
      const releaseDate =
        typeof album.release_date === "string"
          ? album.release_date
          : typeof h.release_date === "string"
            ? (h.release_date as string)
            : ""
      const year = releaseDate ? Number(releaseDate.slice(0, 4)) : null
      return {
        trackId: String(h.id),
        title: String(h.title ?? ""),
        artistName: String(artist.name ?? ""),
        artistId: String(artist.id ?? ""),
        albumId: String(album.id ?? ""),
        albumTitle: String(album.title ?? ""),
        albumArtUrl: pickAlbumImage(album),
        releaseYear: year && Number.isFinite(year) ? year : null,
      }
    })
  } catch {
    return []
  }
}

export async function getArtistById(id: string): Promise<DeezerArtistMatch | null> {
  try {
    const body = (await deezerFetch(`/artist/${encodeURIComponent(id)}`)) as Record<string, unknown>
    if (!body || !body.id) return null
    return {
      id: String(body.id),
      name: String(body.name ?? ""),
      imageUrl: pickArtistImage(body),
    }
  } catch (e) {
    audit("artwork_resolve_failed", {
      provider: "deezer",
      kind: "artist_lookup",
      query: id,
      message: String(e),
    })
    return null
  }
}

export async function getTrackById(id: string): Promise<DeezerTrackMatch | null> {
  try {
    const body = (await deezerFetch(`/track/${encodeURIComponent(id)}`)) as Record<string, unknown>
    if (!body || !body.id) return null
    const album = (body.album as Record<string, unknown> | undefined) ?? {}
    const artist = (body.artist as Record<string, unknown> | undefined) ?? {}
    return {
      trackId: String(body.id),
      albumId: String(album.id ?? ""),
      title: String(body.title ?? ""),
      artistName: String(artist.name ?? ""),
      albumArtUrl: pickAlbumImage(album),
    }
  } catch (e) {
    audit("artwork_resolve_failed", {
      provider: "deezer",
      kind: "track_lookup",
      query: id,
      message: String(e),
    })
    return null
  }
}
