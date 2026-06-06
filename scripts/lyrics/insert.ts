import fs from "node:fs"
import path from "node:path"

import { adminConfig, artistDir } from "./config.ts"
import { loadTagsFromAdmin, pickDistractorsSmart, recordUsed } from "./tags.ts"

interface Args {
  artist: string
  dryRun: boolean
  delayMs: number
  limit: number
  file: string
  markReviewed: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    artist: "",
    dryRun: false,
    delayMs: 300,
    limit: 0,
    file: "candidates.json",
    markReviewed: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--artist") args.artist = argv[++i] ?? ""
    else if (a === "--dry-run") args.dryRun = true
    else if (a === "--delay") args.delayMs = Number(argv[++i] ?? 300)
    else if (a === "--limit") args.limit = Number(argv[++i] ?? 0)
    else if (a === "--file") args.file = argv[++i] ?? "candidates.json"
    else if (a === "--mark-reviewed") args.markReviewed = true
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: pnpm lyrics:insert --artist <name> [--dry-run] [--delay 300] [--limit 0] [--file candidates.json] [--mark-reviewed]",
      )
      console.log(
        "  By default bars land unreviewed so they show up in /admin/review. Pass --mark-reviewed to skip the queue.",
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

/**
 * Curated candidate. `couplet` is the bar text; legacy files may use `lines`.
 * `pick` gates insertion — only picked rows ship.
 */
interface Candidate {
  songId?: number
  song: string
  album: string | null
  year: number | null
  couplet?: string
  lines?: string
  pick?: boolean
  artist?: string
  distractor1?: string
  distractor2?: string
  clozePrompt?: string
  perfectSolution?: string[]
}

function barText(c: Candidate): string {
  return (c.couplet ?? c.lines ?? "").trim()
}

function normalizeLine(s: string): string {
  let t = s.trim().replace(/\s+/g, " ")
  // Spec for pquiz-add: every bar/line must end with " /"
  if (!t.endsWith("/")) t = `${t} /`
  else if (!t.endsWith(" /")) t = t.replace(/\/+$/, "").trim() + " /"
  return t
}

async function postBar(
  baseUrl: string,
  token: string,
  artist: string,
  c: Candidate,
  usedPairs: Set<string>,
): Promise<{ status: number; body: any }> {
  let d1 = c.distractor1
  let d2 = c.distractor2
  if (!d1 || !d2) {
    ;[d1, d2] = pickDistractorsSmart(artist, barText(c), c.song, { usedPairs })
  }
  recordUsed(usedPairs, artist, d1, d2)
  const payload: Record<string, unknown> = {
    artist,
    song: c.song,
    line: normalizeLine(barText(c)),
    distractor1: d1,
    distractor2: d2,
  }
  if (c.album) payload.album = c.album
  if (c.year) payload.releaseYear = c.year
  const res = await fetch(`${baseUrl}/api/admin/bars`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    body = await res.text()
  }
  return { status: res.status, body }
}

/**
 * Author finishing-lines (cloze) on a freshly created bar. Leaves `reviewed`
 * at its default (false) so the bar lands in /admin/review for human QC —
 * unless `markReviewed` is set. Returns null if there's nothing to patch.
 */
async function patchBar(
  baseUrl: string,
  token: string,
  id: number,
  c: Candidate,
  markReviewed: boolean,
): Promise<{ status: number; body: any } | null> {
  const payload: Record<string, unknown> = {}
  if (c.clozePrompt && c.perfectSolution && c.perfectSolution.length > 0) {
    payload.clozePrompt = normalizeLine(c.clozePrompt)
    payload.perfectSolution = c.perfectSolution
  }
  if (markReviewed) payload.reviewed = true
  if (Object.keys(payload).length === 0) return null
  const res = await fetch(`${baseUrl}/api/admin/bars/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    body = await res.text()
  }
  return { status: res.status, body }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { baseUrl, token } = adminConfig()
  await loadTagsFromAdmin()
  const dir = artistDir(args.artist)
  const candPath = path.join(dir, args.file)
  if (!fs.existsSync(candPath)) {
    console.error(`no ${candPath} — run lyrics:extract and curate first`)
    process.exit(1)
  }
  let candidates = JSON.parse(fs.readFileSync(candPath, "utf8")) as Candidate[]

  // Only ship picked rows. Files without any `pick` field (legacy curated.json)
  // are treated as fully picked for backwards compatibility.
  const anyPickField = candidates.some((c) => typeof c.pick === "boolean")
  if (anyPickField) candidates = candidates.filter((c) => c.pick === true)
  if (args.limit > 0) candidates = candidates.slice(0, args.limit)

  if (candidates.length === 0) {
    console.log("Nothing to insert (no rows with pick=true). Curate candidates.json first.")
    return
  }

  console.log(`→ ${args.dryRun ? "DRY RUN " : ""}inserting ${candidates.length} bars for ${args.artist}`)
  console.log(`  target: ${baseUrl}`)

  const stats = { ok: 0, dup: 0, err: 0, cloze: 0 }
  const usedPairs = new Set<string>()
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!
    const label = `[${i + 1}/${candidates.length}] ${c.song.slice(0, 30)}`
    const line = normalizeLine(barText(c))
    const hasCloze = Boolean(c.clozePrompt && c.perfectSolution && c.perfectSolution.length > 0)

    if (args.dryRun) {
      const correct = c.artist ?? args.artist
      let [pd1, pd2] = [c.distractor1, c.distractor2]
      if (!pd1 || !pd2) {
        ;[pd1, pd2] = pickDistractorsSmart(correct, barText(c), c.song, { usedPairs })
      }
      recordUsed(usedPairs, correct, pd1, pd2)
      console.log(`  · ${label}: ${line}`)
      console.log(`     → ${pd1} / ${pd2}${c.distractor1 ? " (pinned)" : ""}`)
      if (hasCloze) console.log(`     ◇ cloze: ${normalizeLine(c.clozePrompt!)} → [${c.perfectSolution!.join(", ")}]`)
      continue
    }

    const r = await postBar(baseUrl, token, c.artist ?? args.artist, c, usedPairs)
    if (r.status === 201) {
      const id = r.body?.punchlineId
      console.log(`  ✓ ${label} → ${id ?? "?"}`)
      stats.ok++
      if (id) {
        const pr = await patchBar(baseUrl, token, id, c, args.markReviewed)
        if (pr && pr.status === 200) {
          if (hasCloze) stats.cloze++
        } else if (pr) {
          console.warn(`     ! cloze PATCH failed → ${pr.status}: ${JSON.stringify(pr.body).slice(0, 160)}`)
        }
      }
    } else if (r.status === 409) {
      console.log(`  ≡ ${label} → duplicate`)
      stats.dup++
    } else if (r.status === 401) {
      console.error(`  ✗ auth error — check PQUIZ_ADMIN_TOKEN`)
      process.exit(1)
    } else {
      console.warn(`  ✗ ${label} → ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`)
      stats.err++
    }
    await new Promise((res) => setTimeout(res, args.delayMs))
  }

  console.log(`\nDone. created=${stats.ok} cloze=${stats.cloze} duplicates=${stats.dup} errors=${stats.err}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
