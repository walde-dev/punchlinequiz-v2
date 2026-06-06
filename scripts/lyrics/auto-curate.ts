import fs from "node:fs"
import path from "node:path"

import { artistDir } from "./config.ts"
import { loadTagsFromAdmin, pickDistractorsSmart, recordUsed } from "./tags.ts"

/**
 * No-LLM fallback curation. Marks pick=true on the strongest couplets and
 * assigns heuristic distractors, editing candidates.json in place. Does NOT
 * author cloze — that needs judgment, so auto-curated bars stay classic-only.
 * Prefer `/curate-artist` (Claude in the loop) for quality + cloze.
 */

interface Args {
  artist: string
  target: number
  perSong: number
  minRhyme: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = { artist: "", target: 25, perSong: 3, minRhyme: 0.6 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--artist") args.artist = argv[++i] ?? ""
    else if (a === "--target") args.target = Number(argv[++i] ?? 25)
    else if (a === "--per-song") args.perSong = Number(argv[++i] ?? 3)
    else if (a === "--min-rhyme") args.minRhyme = Number(argv[++i] ?? 0.6)
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: pnpm lyrics:auto-curate --artist <name> [--target 25] [--per-song 3] [--min-rhyme 0.6]",
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
  couplet: string
  rhymeScore: number
  heuristicScore: number
  pick: boolean
  distractor1: string
  distractor2: string
  [key: string]: unknown
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

  const ranked = [...candidates]
    .filter((c) => c.rhymeScore >= args.minRhyme)
    .sort((a, b) => b.rhymeScore - a.rhymeScore || b.heuristicScore - a.heuristicScore)

  const perSongCount = new Map<number, number>()
  const usedPairs = new Set<string>()
  let picked = 0
  for (const c of ranked) {
    if (picked >= args.target) break
    const n = perSongCount.get(c.songId) ?? 0
    if (n >= args.perSong) continue
    perSongCount.set(c.songId, n + 1)
    const [d1, d2] = pickDistractorsSmart(args.artist, c.couplet, c.song, { usedPairs })
    recordUsed(usedPairs, args.artist, d1, d2)
    c.pick = true
    c.distractor1 = d1
    c.distractor2 = d2
    picked++
  }

  fs.writeFileSync(candPath, JSON.stringify(candidates, null, 2), "utf8")
  console.log(
    `✓ auto-picked ${picked}/${args.target} bars across ${perSongCount.size} songs (classic-only) → ${candPath}`,
  )
  console.log(`  Review picks, then: pnpm lyrics:insert --artist "${args.artist}"`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
