import fs from "node:fs"
import path from "node:path"
import readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

import { artistDir } from "./config.ts"
import { loadTagsFromAdmin, pickDistractorsSmart, recordUsed } from "./tags.ts"

interface Args {
  artist: string
  songId?: number
  resume: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { artist: "", resume: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--artist") args.artist = argv[++i] ?? ""
    else if (a === "--song-id") args.songId = Number(argv[++i] ?? 0)
    else if (a === "--resume") args.resume = true
    else if (a === "-h" || a === "--help") {
      console.log("Usage: pnpm lyrics:curate --artist <name> [--song-id <id>] [--resume]")
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
  let candidates = JSON.parse(fs.readFileSync(candPath, "utf8")) as Candidate[]
  if (args.songId) candidates = candidates.filter((c) => c.songId === args.songId)

  const curatedPath = path.join(dir, "curated.json")
  const curated: Candidate[] = args.resume && fs.existsSync(curatedPath)
    ? (JSON.parse(fs.readFileSync(curatedPath, "utf8")) as Candidate[])
    : []
  const pickedKey = new Set(curated.map((c) => `${c.songId}|${c.lines}`))

  const rl = readline.createInterface({ input, output })
  const ask = (q: string) => rl.question(q)

  // group by song
  const groups = new Map<number, Candidate[]>()
  for (const c of candidates) {
    if (!groups.has(c.songId)) groups.set(c.songId, [])
    groups.get(c.songId)!.push(c)
  }

  console.log(`\nCurating ${args.artist} — ${candidates.length} candidates across ${groups.size} songs.`)
  console.log("Commands: <numbers> select, 'a' all, 'n' next song, 's' save+stop, 'q' stop w/o save\n")

  const usedPairs = new Set<string>()
  for (const c of curated) {
    if (c.distractor1 && c.distractor2) {
      recordUsed(usedPairs, args.artist, c.distractor1, c.distractor2)
    }
  }

  outer: for (const [songId, list] of groups) {
    const head = list[0]!
    console.log(`\n── ${head.song} ${head.album ? `(${head.album}${head.year ? `, ${head.year}` : ""})` : ""}`)
    list.forEach((c, i) => {
      const marker = pickedKey.has(`${c.songId}|${c.lines}`) ? "✓" : " "
      console.log(`  ${marker} ${String(i + 1).padStart(2)}. [${c.score}] ${c.lines}`)
    })
    const ans = (await ask("→ pick (e.g. '1 3 5', 'a' for all, 'n' next, 's' save+stop, 'q' quit): ")).trim().toLowerCase()
    if (ans === "q") {
      console.log("(no save)")
      rl.close()
      return
    }
    if (ans === "s") break outer
    if (ans === "n" || ans === "") continue
    const picks: number[] = ans === "a"
      ? list.map((_, i) => i + 1)
      : ans.split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= list.length)
    for (const i of picks) {
      const c = list[i - 1]!
      const k = `${c.songId}|${c.lines}`
      if (pickedKey.has(k)) continue
      const [d1, d2] = pickDistractorsSmart(args.artist, c.lines, c.song, { usedPairs })
      console.log(`     ${i}. distractors → ${d1} / ${d2}`)
      const ov = (await ask(`        keep [enter] or override (e.g. 'd1=Sido d2=Fler'): `)).trim()
      let finalD1 = d1
      let finalD2 = d2
      if (ov) {
        const m1 = ov.match(/d1\s*=\s*([^\s,]+(?:\s+[^\s,]+)?)/i)
        const m2 = ov.match(/d2\s*=\s*([^\s,]+(?:\s+[^\s,]+)?)/i)
        if (m1) finalD1 = m1[1]!.trim()
        if (m2) finalD2 = m2[1]!.trim()
      }
      recordUsed(usedPairs, args.artist, finalD1, finalD2)
      pickedKey.add(k)
      curated.push({ ...c, selected: true, distractor1: finalD1, distractor2: finalD2 })
    }
    console.log(`  ✓ ${picks.length} added (total ${curated.length})`)
  }

  fs.writeFileSync(curatedPath, JSON.stringify(curated, null, 2), "utf8")
  console.log(`\n✓ saved ${curated.length} curated bars → ${curatedPath}`)
  rl.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
