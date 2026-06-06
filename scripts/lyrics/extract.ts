import fs from "node:fs"
import path from "node:path"

import { artistDir } from "./config.ts"
import { rhymeScore } from "./rhyme.ts"

interface Args {
  artist: string
  perSong: number
  minWords: number
  minRhyme: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = { artist: "", perSong: 12, minWords: 6, minRhyme: 0.4 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--artist") args.artist = argv[++i] ?? ""
    else if (a === "--per-song") args.perSong = Number(argv[++i] ?? 12)
    else if (a === "--min-words") args.minWords = Number(argv[++i] ?? 6)
    else if (a === "--min-rhyme") args.minRhyme = Number(argv[++i] ?? 0.4)
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: pnpm lyrics:extract --artist <name> [--per-song 12] [--min-words 6] [--min-rhyme 0.4]",
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

/** A rhyme-aware couplet candidate plus empty fields Claude fills during curation. */
interface Candidate {
  songId: number
  song: string
  album: string | null
  year: number | null
  section: string
  couplet: string
  context: string
  rhymeScore: number
  heuristicScore: number
  // --- filled by Claude during curation ---
  pick: boolean
  distractor1: string
  distractor2: string
  clozePrompt: string
  perfectSolution: string[]
  notes: string
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

function scoreCouplet(text: string): number {
  let score = 0
  for (const re of PUNCHLINE_MARKERS) if (re.test(text)) score += 2
  if (/[,;–-]/.test(text)) score += 1
  const wc = wordCount(text)
  if (wc >= 8 && wc <= 30) score += 2
  if (wc > 36) score -= 1
  return score
}

function extractFromLyrics(
  song: SongRecord,
  text: string,
  args: Args,
): Candidate[] {
  const rawLines = text.split("\n").map((l) => l.trim())
  let section = "verse_1"
  const blocks: { section: string; lines: string[] }[] = []
  let current: { section: string; lines: string[] } = { section, lines: [] }

  for (const ln of rawLines) {
    const m = ln.match(SECTION_RE)
    if (m) {
      if (current.lines.length) blocks.push(current)
      section = m[1]!.toLowerCase().replace(/\s+/g, "_")
      current = { section, lines: [] }
      continue
    }
    if (!ln) {
      if (current.lines.length) blocks.push(current)
      current = { section, lines: [] }
      continue
    }
    current.lines.push(ln)
  }
  if (current.lines.length) blocks.push(current)

  const seen = new Set<string>()
  const out: Candidate[] = []

  for (const block of blocks) {
    if (isHookLine(block.section)) continue
    const L = block.lines

    // Score every adjacent pair, then greedily keep non-overlapping couplets
    // best-rhyme-first. This prevents emitting a payoff+setup crossing pair:
    // the true couplets win the overlap contest.
    const pairs: { i: number; rhyme: number }[] = []
    for (let i = 0; i + 1 < L.length; i++) {
      pairs.push({ i, rhyme: rhymeScore(L[i]!, L[i + 1]!) })
    }
    pairs.sort((a, b) => b.rhyme - a.rhyme)

    const claimed = new Set<number>()
    for (const { i, rhyme } of pairs) {
      if (rhyme < args.minRhyme) continue
      if (claimed.has(i) || claimed.has(i + 1)) continue
      const couplet = `${L[i]} / ${L[i + 1]}`
      if (wordCount(couplet) < args.minWords) continue
      if (couplet.length > 280) continue
      const key = couplet.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      claimed.add(i)
      claimed.add(i + 1)

      const ctxStart = Math.max(0, i - 1)
      const ctxEnd = Math.min(L.length, i + 3)
      out.push({
        songId: song.id,
        song: song.title,
        album: song.album,
        year: song.year,
        section: block.section,
        couplet,
        context: L.slice(ctxStart, ctxEnd).join("\n"),
        rhymeScore: Number(rhyme.toFixed(2)),
        heuristicScore: scoreCouplet(couplet),
        pick: false,
        distractor1: "",
        distractor2: "",
        clozePrompt: "",
        perfectSolution: [],
        notes: "",
      })
    }
  }

  // Best couplets first: rhyme strength then content heuristic.
  out.sort((a, b) => b.rhymeScore - a.rhymeScore || b.heuristicScore - a.heuristicScore)
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
    all.push(...extractFromLyrics(song, text, args))
  }

  const outPath = path.join(dir, "candidates.json")
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf8")
  console.log(`✓ ${all.length} couplet candidates across ${songs.length} songs → ${outPath}`)
  console.log(`  Next: review candidates.json, set pick=true + distractors + cloze, then lyrics:insert.`)
}

main()
