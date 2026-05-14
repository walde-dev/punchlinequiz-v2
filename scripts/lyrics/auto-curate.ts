import fs from "node:fs"
import path from "node:path"

import { artistDir } from "./config.ts"
import { loadTagsFromAdmin, pickDistractorsSmart, recordUsed } from "./tags.ts"

interface Args {
  artist: string
  target: number
  perSong: number
  minScore: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = { artist: "", target: 25, perSong: 3, minScore: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--artist") args.artist = argv[++i] ?? ""
    else if (a === "--target") args.target = Number(argv[++i] ?? 25)
    else if (a === "--per-song") args.perSong = Number(argv[++i] ?? 3)
    else if (a === "--min-score") args.minScore = Number(argv[++i] ?? 0)
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: pnpm lyrics:auto-curate --artist <name> [--target 25] [--per-song 3] [--min-score 0]",
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
  distractor1?: string
  distractor2?: string
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await loadTagsFromAdmin()
  const dir = artistDir(args.artist)
  const candPath = path.join(dir, "candidates.json")
  if (!fs.existsSync(candPath)) {
    console.error(`no ${candPath} — run lyrics:extract first`)
    process.exit(1)
  }
  const candidates = JSON.parse(fs.readFileSync(candPath, "utf8")) as Candidate[]

  // Sort by score desc. Walk and pick up to perSong per song until target hit.
  const pool = [...candidates]
    .filter((c) => c.score >= args.minScore)
    .sort((a, b) => b.score - a.score)
  const perSongCount = new Map<number, number>()
  const picked: Candidate[] = []
  for (const c of pool) {
    if (picked.length >= args.target) break
    const n = perSongCount.get(c.songId) ?? 0
    if (n >= args.perSong) continue
    perSongCount.set(c.songId, n + 1)
    picked.push({ ...c, selected: true })
  }

  // Assign distractors deterministically with diversity tracking.
  const usedPairs = new Set<string>()
  for (const p of picked) {
    const [d1, d2] = pickDistractorsSmart(args.artist, p.lines, p.song, { usedPairs })
    p.distractor1 = d1
    p.distractor2 = d2
    recordUsed(usedPairs, args.artist, d1, d2)
  }

  const outPath = path.join(dir, "curated.json")
  fs.writeFileSync(outPath, JSON.stringify(picked, null, 2), "utf8")
  console.log(
    `✓ auto-curated ${picked.length}/${args.target} bars across ${perSongCount.size} songs → ${outPath}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
