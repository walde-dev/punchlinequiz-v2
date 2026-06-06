import fs from "node:fs"
import path from "node:path"

import { artistDir, slugify } from "./config.ts"

/**
 * Curation helper — the repeatable core of the curate flow.
 *
 *   --list             Print candidates as structured JSON (one array) to stdout,
 *                      each tagged with an `attribution` class so an agent can
 *                      skip feature / joint verses. Use --attributable-only to
 *                      pre-filter to host/solo verses.
 *   --picks <file|->   Apply a picks JSON array to candidates.json: set pick=true,
 *                      distractors, and derive clozePrompt by replacing the
 *                      solution word in the real couplet text (no transcription).
 *
 * Picks JSON entry:
 *   {
 *     "needle": "Deutschraps Miroslav Klose",   // unique substring of the couplet
 *     "solution": "Klose",                        // word(s) to blank; must appear in couplet
 *     "perfectSolution": ["Klose","Miroslav Klose"], // optional; defaults to [solution]
 *     "distractor1": "Luciano",
 *     "distractor2": "Ufo361",
 *     "clozePrompt": "...optional explicit override...",
 *     "artist": "..."                              // optional per-bar artist override
 *   }
 * Omit solution+clozePrompt to ship the bar classic-only (no cloze).
 */

interface Args {
  artist: string
  mode: "list" | "picks" | null
  picksFile: string
  attributableOnly: boolean
  noReset: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { artist: "", mode: null, picksFile: "", attributableOnly: false, noReset: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--artist") args.artist = argv[++i] ?? ""
    else if (a === "--list") args.mode = "list"
    else if (a === "--picks") { args.mode = "picks"; args.picksFile = argv[++i] ?? "" }
    else if (a === "--attributable-only") args.attributableOnly = true
    else if (a === "--no-reset") args.noReset = true
    else if (a === "-h" || a === "--help") {
      console.log("Usage:")
      console.log("  pnpm lyrics:pick --artist <name> --list [--attributable-only]")
      console.log("  pnpm lyrics:pick --artist <name> --picks <file.json|->  [--no-reset]")
      process.exit(0)
    }
  }
  if (!args.artist) { console.error("--artist <name> is required"); process.exit(1) }
  if (!args.mode) { console.error("one of --list or --picks is required"); process.exit(1) }
  return args
}

type Attribution = "host" | "solo" | "joint" | "feature"

/**
 * Classify whose verse a section is, so feature/joint verses can be skipped —
 * crediting them to the wrong artist is a wrong answer in the game.
 *   host    plain `part_N` / `verse_N` — the song's main artist (usually correct
 *           on the artist's own songs; sanity-check on remixes/cyphers).
 *   solo    `part_N:_<artist>` — explicitly this artist's verse.
 *   joint   `part_N:_<artist>_&_<other>` — shared; ambiguous, skip.
 *   feature `part_N:_<other>` — someone else's verse, skip.
 */
export function classifySection(section: string, artistSlug: string): Attribution {
  const s = section.toLowerCase()
  const colon = s.indexOf(":")
  if (colon === -1) return "host"
  const after = s.slice(colon + 1).replace(/^_+/, "")
  const names = after
    .split(/_?&_?|_und_|,|\+/)
    .map((n) => n.replace(/_/g, " ").trim())
    .filter(Boolean)
  if (names.length === 0) return "host"
  const target = artistSlug.replace(/-/g, " ")
  const targetTight = artistSlug.replace(/-/g, "")
  const isTarget = (n: string) =>
    n === target || n.replace(/\s/g, "") === targetTight || n.includes(target) || target.includes(n)
  const matches = names.filter(isTarget)
  if (matches.length && names.length === 1) return "solo"
  if (matches.length) return "joint"
  return "feature"
}

function attributable(a: Attribution): boolean {
  return a === "host" || a === "solo"
}

function readCandidates(dir: string): { p: string; cands: any[] } {
  const p = path.join(dir, "candidates.json")
  if (!fs.existsSync(p)) {
    console.error(`no ${p} — run lyrics:extract first`)
    process.exit(1)
  }
  return { p, cands: JSON.parse(fs.readFileSync(p, "utf8")) as any[] }
}

function doList(dir: string, slug: string, attributableOnly: boolean) {
  const { cands } = readCandidates(dir)
  const out = cands
    .map((c) => {
      const attribution = classifySection(c.section ?? "", slug)
      return {
        song: c.song,
        section: c.section,
        attribution,
        attributable: attributable(attribution),
        rhymeScore: c.rhymeScore,
        couplet: c.couplet,
        context: c.context,
      }
    })
    .filter((c) => (attributableOnly ? c.attributable : true))
  process.stdout.write(JSON.stringify(out, null, 2) + "\n")
}

interface PickSpec {
  needle: string
  solution?: string
  perfectSolution?: string[]
  clozePrompt?: string
  distractor1: string
  distractor2: string
  artist?: string
}

function readPicks(file: string): PickSpec[] {
  const raw = file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(file, "utf8")
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    console.error("picks file must be a JSON array")
    process.exit(1)
  }
  return parsed as PickSpec[]
}

function doPicks(dir: string, slug: string, file: string, noReset: boolean) {
  const { p, cands } = readCandidates(dir)
  const picks = readPicks(file)
  if (!noReset) for (const c of cands) c.pick = false

  let hit = 0
  const problems: string[] = []
  for (const spec of picks) {
    const c = cands.find((x) => typeof x.couplet === "string" && x.couplet.includes(spec.needle))
    if (!c) { problems.push(`NOT FOUND: "${spec.needle}"`); continue }

    const attr = classifySection(c.section ?? "", slug)
    if (!attributable(attr) && !spec.artist) {
      problems.push(
        `ATTRIBUTION WARNING: "${spec.needle}" is a ${attr} verse (section ${c.section}). ` +
          `Skip it, or set "artist" to the real verse author.`,
      )
      continue
    }

    let clozePrompt = spec.clozePrompt ?? ""
    let perfect = spec.perfectSolution ?? (spec.solution ? [spec.solution] : [])
    if (!clozePrompt && spec.solution) {
      const idx = c.couplet.lastIndexOf(spec.solution)
      if (idx === -1) {
        problems.push(`SOLUTION NOT IN COUPLET: "${spec.solution}" not in "${c.couplet}"`)
        continue
      }
      clozePrompt = c.couplet.slice(0, idx) + "___" + c.couplet.slice(idx + spec.solution.length)
    }

    c.pick = true
    c.distractor1 = spec.distractor1
    c.distractor2 = spec.distractor2
    c.clozePrompt = clozePrompt
    c.perfectSolution = perfect
    if (spec.artist) c.artist = spec.artist
    hit++
  }

  fs.writeFileSync(p, JSON.stringify(cands, null, 2), "utf8")
  console.log(`✓ applied ${hit}/${picks.length} picks → ${p}`)
  if (problems.length) {
    console.log(`\n⚠ ${problems.length} issue(s):`)
    for (const m of problems) console.log(`  - ${m}`)
    process.exitCode = 1
  } else {
    console.log(`  Next: pnpm lyrics:insert --artist "<name>" --dry-run`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const slug = slugify(args.artist)
  const dir = artistDir(args.artist)
  if (args.mode === "list") doList(dir, slug, args.attributableOnly)
  else doPicks(dir, slug, args.picksFile, args.noReset)
}

main()
