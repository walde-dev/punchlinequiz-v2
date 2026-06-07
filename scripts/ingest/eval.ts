/**
 * PUN-169/170/171: accuracy harness. Runs the extraction pipeline against the
 * hand-labeled golden set and reports field-level precision + cost/latency, and
 * pass/fail vs the accuracy gate. Does NOT touch the DB — it measures the
 * vision+grouping stages, which are what the gate is about.
 *
 *   pnpm ingest:eval                 # all golden episodes
 *   pnpm ingest:eval <videoId>       # one golden episode
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ACCURACY_TARGETS } from "./config.ts"
import { extractQuizItems } from "./extract.ts"
import { segmentFrames } from "./frames.ts"
import type { RawQuizItem } from "./types.ts"
import { downloadEpisode, cleanupRun } from "./ytdlp.ts"

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "golden")

type GoldenItem = { line: string; options: Array<string>; correct: string; songTitle?: string | null }
type Golden = { videoId: string; title?: string; items: Array<GoldenItem> }

function norm(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "")
}
function lineSim(a: string, b: string): number {
  const x = norm(a)
  const y = norm(b)
  const max = Math.max(x.length, y.length)
  if (max === 0) return 1
  // cheap: longest-common-prefix ratio + length ratio (good enough for matching)
  let i = 0
  while (i < x.length && i < y.length && x[i] === y[i]) i++
  return i / max
}
function sameSet(a: Array<string>, b: Array<string>): boolean {
  const na = new Set(a.map(norm))
  const nb = new Set(b.map(norm))
  if (na.size !== nb.size) return false
  for (const v of na) if (!nb.has(v)) return false
  return true
}

function matchItem(g: GoldenItem, items: Array<RawQuizItem>): RawQuizItem | null {
  let best: RawQuizItem | null = null
  let bestS = 0.5
  for (const it of items) {
    const s = lineSim(g.line, it.line)
    if (s > bestS) {
      bestS = s
      best = it
    }
  }
  return best
}

async function evalEpisode(golden: Golden) {
  const dl = await downloadEpisode(golden.videoId)
  let frames
  try {
    const t0 = Date.now()
    frames = await segmentFrames(dl.videoPath, dl.runDir)
    const items = await extractQuizItems(frames)
    const ms = Date.now() - t0

    let matched = 0
    let lineHits = 0
    let optionHits = 0
    let correctHits = 0
    let songHits = 0
    for (const g of golden.items) {
      const it = matchItem(g, items)
      if (!it) continue
      matched++
      if (lineSim(g.line, it.line) >= 0.9) lineHits++
      if (sameSet(g.options, it.options)) optionHits++
      const extractedCorrect = it.correctIndex >= 0 ? it.options[it.correctIndex] : ""
      if (norm(extractedCorrect) === norm(g.correct)) correctHits++
      if (g.songTitle && it.songTitle && norm(it.songTitle).includes(norm(g.songTitle))) songHits++
    }
    const total = golden.items.length
    return {
      videoId: golden.videoId,
      total,
      matched,
      extracted: items.length,
      frames: frames.length,
      ms,
      recall: matched / total,
      line: lineHits / total,
      options: optionHits / total,
      correct: correctHits / total,
      song: songHits / total,
    }
  } finally {
    cleanupRun(dl.runDir)
  }
}

async function main() {
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"))
  if (!fs.existsSync(GOLDEN_DIR)) throw new Error(`no golden dir at ${GOLDEN_DIR}`)
  const files = fs
    .readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !only || f.includes(only))
  if (files.length === 0) throw new Error("no golden fixtures found")

  const rows = []
  for (const f of files) {
    const golden = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, f), "utf8")) as Golden
    console.error(`# evaluating ${golden.videoId} (${golden.items.length} labeled items)…`)
    rows.push(await evalEpisode(golden))
  }

  // Aggregate (weight by labeled items).
  const sum = (k: "line" | "options" | "correct" | "recall" | "song") =>
    rows.reduce((a, r) => a + r[k] * r.total, 0) / rows.reduce((a, r) => a + r.total, 0)
  const agg = { line: sum("line"), options: sum("options"), correct: sum("correct"), recall: sum("recall"), song: sum("song") }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  console.log("\n=== WHO DAT?! extraction accuracy ===")
  for (const r of rows) {
    console.log(
      `${r.videoId}: matched ${r.matched}/${r.total} | correct ${pct(r.correct)} | line ${pct(r.line)} | options ${pct(r.options)} | song ${pct(r.song)} | ${r.frames} frames, ${(r.ms / 1000).toFixed(0)}s`,
    )
  }
  console.log(
    `\nAGGREGATE: correct ${pct(agg.correct)} | line ${pct(agg.line)} | options ${pct(agg.options)} | song ${pct(agg.song)} | recall ${pct(agg.recall)}`,
  )

  const pass =
    agg.correct >= ACCURACY_TARGETS.correctAnswer &&
    agg.line >= ACCURACY_TARGETS.line &&
    agg.options >= ACCURACY_TARGETS.options
  console.log(
    `\nGATE (correct≥${pct(ACCURACY_TARGETS.correctAnswer)}, line≥${pct(ACCURACY_TARGETS.line)}, options≥${pct(ACCURACY_TARGETS.options)}): ${pass ? "PASS ✓" : "FAIL ✗"}`,
  )
  // Estimated Gemini input cost (~258 img tokens/frame, $0.30/1M) — order-of-magnitude only.
  const frames = rows.reduce((a, r) => a + r.frames, 0)
  console.log(`# ~${frames} frames extracted ≈ ${(frames * 258 / 1e6 * 0.3).toFixed(4)} USD input (estimate)`)
  if (!pass) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
