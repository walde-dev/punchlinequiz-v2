import fs from "node:fs"
import path from "node:path"

import { artistDir } from "./config.ts"

interface Args {
  artist: string
  perSong: number
  minWords: number
  maxLines: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = { artist: "", perSong: 20, minWords: 5, maxLines: 4 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--artist") args.artist = argv[++i] ?? ""
    else if (a === "--per-song") args.perSong = Number(argv[++i] ?? 20)
    else if (a === "--min-words") args.minWords = Number(argv[++i] ?? 5)
    else if (a === "--max-lines") args.maxLines = Number(argv[++i] ?? 4)
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: pnpm lyrics:extract --artist <name> [--per-song 20] [--min-words 5] [--max-lines 4]",
      )
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

interface Candidate {
  songId: number
  song: string
  album: string | null
  year: number | null
  position: string
  lines: string
  context: string
  score: number
  selected: boolean
}

const SECTION_RE = /^\s*\[([^\]]+)\]\s*$/

const PUNCHLINE_MARKERS = [
  /\bwie\b/i,
  /\bals ob\b/i,
  /\bschneller als\b/i,
  /\bhärter als\b/i,
  /\bmehr \w+ als\b/i,
  /\b(?:€|euro|million|dollar|kilo|gramm)\b/i,
]

function isHookLine(section: string): boolean {
  return /hook|chorus|refrain|intro|outro|bridge/i.test(section)
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

function scoreLines(lines: string): number {
  let score = 0
  for (const re of PUNCHLINE_MARKERS) if (re.test(lines)) score += 2
  if (/[,;–-]/.test(lines)) score += 1
  const wc = wordCount(lines)
  if (wc >= 8 && wc <= 30) score += 2
  if (wc > 30) score -= 1
  return score
}

function extractFromLyrics(
  songId: number,
  song: SongRecord,
  text: string,
  args: Args,
): Candidate[] {
  const lines = text.split("\n").map((l) => l.trim())
  let section = "verse_1"
  let verseIdx = 0
  const blocks: { section: string; lines: string[]; startIdx: number }[] = []
  let current: { section: string; lines: string[]; startIdx: number } = {
    section,
    lines: [],
    startIdx: 0,
  }

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!
    const m = ln.match(SECTION_RE)
    if (m) {
      if (current.lines.length) blocks.push(current)
      const label = m[1]!.toLowerCase()
      if (/verse|strophe/.test(label)) verseIdx += 1
      section = label.replace(/\s+/g, "_")
      current = { section, lines: [], startIdx: i + 1 }
      continue
    }
    if (!ln) {
      if (current.lines.length) blocks.push(current)
      current = { section, lines: [], startIdx: i + 1 }
      continue
    }
    current.lines.push(ln)
  }
  if (current.lines.length) blocks.push(current)

  const seen = new Set<string>()
  const out: Candidate[] = []
  for (const block of blocks) {
    if (isHookLine(block.section)) continue
    // sliding windows of 1..maxLines consecutive lines
    for (let start = 0; start < block.lines.length; start++) {
      for (let span = 1; span <= args.maxLines; span++) {
        if (start + span > block.lines.length) break
        const chunk = block.lines.slice(start, start + span).join(" / ")
        if (wordCount(chunk) < args.minWords) continue
        if (chunk.length > 280) continue
        const key = chunk.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        const ctxStart = Math.max(0, start - 1)
        const ctxEnd = Math.min(block.lines.length, start + span + 1)
        const ctx = block.lines.slice(ctxStart, ctxEnd).join("\n")
        const score = scoreLines(chunk) + (span === 2 ? 1 : 0)
        out.push({
          songId,
          song: song.title,
          album: song.album,
          year: song.year,
          position: block.section,
          lines: chunk,
          context: ctx,
          score,
          selected: false,
        })
      }
    }
  }

  out.sort((a, b) => b.score - a.score)
  return out.slice(0, args.perSong)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const dir = artistDir(args.artist)
  const songsPath = path.join(dir, "songs.json")
  if (!fs.existsSync(songsPath)) {
    console.error(`no ${songsPath} — run lyrics:fetch first`)
    process.exit(1)
  }
  const songs = JSON.parse(fs.readFileSync(songsPath, "utf8")) as SongRecord[]

  const all: Candidate[] = []
  for (const song of songs) {
    if (song.lyricsError) continue
    const txtPath = path.join(dir, song.lyricsPath)
    if (!fs.existsSync(txtPath)) continue
    const text = fs.readFileSync(txtPath, "utf8")
    const cands = extractFromLyrics(song.id, song, text, args)
    all.push(...cands)
  }

  const outPath = path.join(dir, "candidates.json")
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf8")
  console.log(`✓ ${all.length} candidates across ${songs.length} songs → ${outPath}`)
}

main()
