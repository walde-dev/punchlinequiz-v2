import fs from "node:fs"
import path from "node:path"

import { artistDir, ensureDir } from "./config.ts"
import {
  artistSongs,
  fetchLyrics,
  searchSongs,
  songDetail,
  sleep,
  type GeniusSongDetail,
} from "./genius.ts"

interface Args {
  artist: string
  songs: number
  force: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { artist: "", songs: 30, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--artist") args.artist = argv[++i] ?? ""
    else if (a === "--songs") args.songs = Number(argv[++i] ?? 30)
    else if (a === "--force") args.force = true
    else if (a === "-h" || a === "--help") {
      console.log("Usage: pnpm lyrics:fetch --artist <name> [--songs 30] [--force]")
      process.exit(0)
    }
  }
  if (!args.artist) {
    console.error("--artist <name> is required")
    process.exit(1)
  }
  return args
}

interface SongRecord {
  id: number
  title: string
  url: string
  album: string | null
  year: number | null
  albumArtUrl: string | null
  lyricsPath: string
  lyricsError?: string
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dir = artistDir(args.artist)
  const lyricsDir = path.join(dir, "lyrics")
  ensureDir(lyricsDir)

  console.log(`→ searching Genius for "${args.artist}"`)
  const hits = await searchSongs(args.artist)
  if (hits.length === 0) {
    console.error("no results")
    process.exit(1)
  }

  // Resolve the artist id from the most popular hit that matches the name.
  const target = hits.find(
    (h) => h.primaryArtist.toLowerCase() === args.artist.toLowerCase(),
  ) ?? hits[0]!
  console.log(`→ artist id ${target.artistId} (${target.primaryArtist})`)

  console.log(`→ fetching top ${args.songs} songs`)
  const songs = await artistSongs(target.artistId, args.songs)
  console.log(`  got ${songs.length} songs`)

  const records: SongRecord[] = []
  for (let i = 0; i < songs.length; i++) {
    const s = songs[i]!
    const lyricsPath = path.join(lyricsDir, `${s.id}.txt`)
    const already = fs.existsSync(lyricsPath) && !args.force

    let detail: GeniusSongDetail | null = null
    try {
      detail = await songDetail(s.id)
    } catch (e) {
      console.warn(`  ! detail failed for ${s.title}: ${(e as Error).message}`)
    }
    await sleep(120)

    const record: SongRecord = {
      id: s.id,
      title: s.title,
      url: s.url,
      album: detail?.albumName ?? null,
      year: detail?.releaseYear ?? null,
      albumArtUrl: s.albumArtUrl,
      lyricsPath: path.relative(dir, lyricsPath),
    }

    if (already) {
      console.log(`  [${i + 1}/${songs.length}] ${s.title} (cached)`)
    } else {
      try {
        const lyrics = await fetchLyrics(s.url)
        fs.writeFileSync(lyricsPath, lyrics, "utf8")
        console.log(`  [${i + 1}/${songs.length}] ${s.title} ✓ ${lyrics.length} chars`)
      } catch (e) {
        record.lyricsError = (e as Error).message
        console.warn(`  [${i + 1}/${songs.length}] ${s.title} ✗ ${record.lyricsError}`)
      }
      await sleep(400)
    }
    records.push(record)
  }

  const songsJson = path.join(dir, "songs.json")
  fs.writeFileSync(songsJson, JSON.stringify(records, null, 2), "utf8")
  const ok = records.filter((r) => !r.lyricsError).length
  console.log(`\n✓ wrote ${songsJson}`)
  console.log(`  ${ok}/${records.length} songs with lyrics`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
