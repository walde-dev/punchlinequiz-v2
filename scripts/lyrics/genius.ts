import { geniusToken } from "./config.ts"

const API = "https://api.genius.com"
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

export interface GeniusSearchHit {
  id: number
  title: string
  url: string
  primaryArtist: string
  artistId: number
  albumArtUrl: string | null
}

export interface GeniusSongDetail {
  id: number
  title: string
  url: string
  albumName: string | null
  releaseDate: string | null
  releaseYear: number | null
  primaryArtist: string
  albumArtUrl: string | null
}

async function api<T>(path: string): Promise<T> {
  const token = await geniusToken()
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
  })
  if (!res.ok) {
    throw new Error(`Genius API ${path}: ${res.status} ${await res.text().catch(() => "")}`)
  }
  const json = (await res.json()) as { response: T }
  return json.response
}

export async function searchSongs(query: string): Promise<GeniusSearchHit[]> {
  const data = await api<{ hits: Array<{ type: string; result: any }> }>(
    `/search?q=${encodeURIComponent(query)}`,
  )
  return data.hits
    .filter((h) => h.type === "song")
    .map((h) => ({
      id: h.result.id,
      title: h.result.title,
      url: h.result.url,
      primaryArtist: h.result.primary_artist?.name ?? "",
      artistId: h.result.primary_artist?.id ?? 0,
      albumArtUrl: h.result.song_art_image_url ?? null,
    }))
}

/**
 * Fetch all songs for an artist. Genius paginates 20 at a time.
 */
export async function artistSongs(
  artistId: number,
  limit: number,
): Promise<GeniusSearchHit[]> {
  const out: GeniusSearchHit[] = []
  let page = 1
  while (out.length < limit) {
    const data = await api<{ songs: any[]; next_page: number | null }>(
      `/artists/${artistId}/songs?per_page=20&page=${page}&sort=popularity`,
    )
    for (const s of data.songs) {
      if (s.primary_artist?.id !== artistId) continue // skip features
      out.push({
        id: s.id,
        title: s.title,
        url: s.url,
        primaryArtist: s.primary_artist?.name ?? "",
        artistId: s.primary_artist?.id ?? 0,
        albumArtUrl: s.song_art_image_url ?? null,
      })
      if (out.length >= limit) break
    }
    if (!data.next_page) break
    page = data.next_page
  }
  return out
}

export async function songDetail(songId: number): Promise<GeniusSongDetail> {
  const data = await api<{ song: any }>(`/songs/${songId}`)
  const s = data.song
  const releaseDate: string | null = s.release_date ?? null
  const year = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null
  return {
    id: s.id,
    title: s.title,
    url: s.url,
    albumName: s.album?.name ?? null,
    releaseDate,
    releaseYear: Number.isFinite(year) ? year : null,
    primaryArtist: s.primary_artist?.name ?? "",
    albumArtUrl: s.song_art_image_url ?? null,
  }
}

/**
 * Scrape lyrics from a Genius song page. Lyrics live in one or more
 * <div data-lyrics-container="true"> blocks. We extract text and preserve
 * line breaks from <br>.
 */
export async function fetchLyrics(songUrl: string): Promise<string> {
  const res = await fetch(songUrl, { headers: { "User-Agent": UA } })
  if (!res.ok) throw new Error(`fetch ${songUrl}: ${res.status}`)
  const html = await res.text()

  const containers = extractAll(html, /<div[^>]+data-lyrics-container[^>]*>([\s\S]*?)<\/div>/g)
  if (containers.length === 0) {
    // Fallback for older page layout
    const legacy = extractAll(html, /<div class="lyrics">([\s\S]*?)<\/div>/g)
    if (legacy.length === 0) throw new Error(`no lyrics found at ${songUrl}`)
    containers.push(...legacy)
  }

  const parts: string[] = []
  for (const inner of containers) {
    let text = inner
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div)>/gi, "\n")
      // Drop annotation links/wrappers but keep their text
      .replace(/<[^>]+>/g, "")
    text = decodeEntities(text)
    parts.push(text)
  }
  return parts.join("\n").trim()
}

function extractAll(s: string, re: RegExp): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) out.push(m[1]!)
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
