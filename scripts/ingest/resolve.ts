import { searchSongs, songDetail } from "../lyrics/genius.ts"
import type { RawQuizItem } from "./types.ts"

export type SongInfo = {
  title: string
  /** Artist name to search artwork under (the track's primary credit). */
  artworkArtist: string
  album: string | null
  releaseYear: number | null
  /** How the title was determined — surfaced for review trust. */
  source: "reveal_credit" | "genius_lyric_search"
}

/** Split a reveal credit ("Ansu, Tom Hengst & Cato") into individual artist names. */
export function creditArtists(credit: string | null): Array<string> {
  if (!credit) return []
  const before = credit.split(/\s+[-–—]\s+/)[0]
  return before
    .split(/,|&|\bfeat\.?\b|\bft\.?\b|\bx\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "")
}

/**
 * Resolve a song title for an item (PUN-155). Primary signal: the on-screen
 * reveal credit ("… - HELD") — far more reliable than lyric search. Falls back
 * to Genius lyric search when the title wasn't read. Best-effort Genius lookup
 * enriches release year / album. Returns null only if we can't determine a
 * title at all (caller routes to the unresolved path).
 */
export async function resolveSongInfo(
  item: RawQuizItem,
  correctArtistName: string,
): Promise<SongInfo | null> {
  const credits = creditArtists(item.songCredit)
  const artworkArtist = credits[0] ?? correctArtistName

  let title = item.songTitle?.trim() || null
  let source: SongInfo["source"] = "reveal_credit"

  if (!title) {
    // Lyric fallback: search Genius for the first chunk of the bar.
    const snippet = item.line.replace(/\n/g, " ").slice(0, 80)
    try {
      const hits = await searchSongs(snippet)
      if (hits.length > 0) {
        title = hits[0].title
        source = "genius_lyric_search"
      }
    } catch {
      /* non-fatal */
    }
  }
  if (!title) return null

  // Best-effort enrichment (release year / album) — never fatal.
  let album: string | null = null
  let releaseYear: number | null = null
  try {
    const q = `${artworkArtist} ${title}`
    const hits = await searchSongs(q)
    const hit =
      hits.find((h) => norm(h.title).includes(norm(title!)) || norm(title!).includes(norm(h.title))) ??
      hits[0]
    if (hit) {
      const detail = await songDetail(hit.id)
      album = detail.albumName
      releaseYear = detail.releaseYear
    }
  } catch {
    /* non-fatal */
  }

  return { title, artworkArtist, album, releaseYear, source }
}

/** Sanity check (PUN-155): the quiz's correct artist should appear in the credit. */
export function correctArtistInCredit(correctArtistName: string, credit: string | null): boolean {
  if (!credit) return false
  const target = norm(correctArtistName)
  return creditArtists(credit).some((a) => norm(a) === target) || norm(credit).includes(target)
}
