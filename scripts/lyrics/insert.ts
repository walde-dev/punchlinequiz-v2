import fs from "node:fs"
import path from "node:path"

import { adminConfig, artistDir } from "./config.ts"
import { loadTagsFromAdmin, pickDistractorsSmart, recordUsed } from "./tags.ts"

interface Args {
  artist: string
  dryRun: boolean
  delayMs: number
  limit: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = { artist: "", dryRun: false, delayMs: 300, limit: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--artist") args.artist = argv[++i] ?? ""
    else if (a === "--dry-run") args.dryRun = true
    else if (a === "--delay") args.delayMs = Number(argv[++i] ?? 300)
    else if (a === "--limit") args.limit = Number(argv[++i] ?? 0)
    else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: pnpm lyrics:insert --artist <name> [--dry-run] [--delay 300] [--limit 0]",
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

interface Curated {
  songId?: number
  song: string
  album: string | null
  year: number | null
  lines: string
  /** Optional per-entry artist override (e.g. for featured verses). */
  artist?: string
  /** Optional distractor overrides set during curate (curate-time pinning). */
  distractor1?: string
  distractor2?: string
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
  c: Curated,
  usedPairs: Set<string>,
): Promise<{ status: number; body: any }> {
  let d1 = c.distractor1
  let d2 = c.distractor2
  if (!d1 || !d2) {
    ;[d1, d2] = pickDistractorsSmart(artist, c.lines, c.song, { usedPairs })
  }
  recordUsed(usedPairs, artist, d1, d2)
  const payload: Record<string, unknown> = {
    artist,
    song: c.song,
    line: normalizeLine(c.lines),
    distractor1: d1,
    distractor2: d2,
  }
  if (c.album) payload.album = c.album
  if (c.year) payload.releaseYear = c.year
  const res = await fetch(`${baseUrl}/api/admin/bars`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
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
  const curatedPath = path.join(dir, "curated.json")
  if (!fs.existsSync(curatedPath)) {
    console.error(`no ${curatedPath} — run lyrics:curate first`)
    process.exit(1)
  }
  let curated = JSON.parse(fs.readFileSync(curatedPath, "utf8")) as Curated[]
  if (args.limit > 0) curated = curated.slice(0, args.limit)

  console.log(`→ ${args.dryRun ? "DRY RUN " : ""}inserting ${curated.length} bars for ${args.artist}`)
  console.log(`  target: ${baseUrl}`)

  const stats = { ok: 0, dup: 0, err: 0 }
  const usedPairs = new Set<string>()
  for (let i = 0; i < curated.length; i++) {
    const c = curated[i]!
    const label = `[${i + 1}/${curated.length}] ${c.song.slice(0, 30)}`
    const line = normalizeLine(c.lines)
    if (args.dryRun) {
      const correct = c.artist ?? args.artist
      const d1 = c.distractor1
      const d2 = c.distractor2
      const [pd1, pd2] = d1 && d2 ? [d1, d2] : pickDistractorsSmart(correct, c.lines, c.song, { usedPairs })
      recordUsed(usedPairs, correct, pd1, pd2)
      console.log(`  · ${label}: ${line}`)
      console.log(`     → ${pd1} / ${pd2}${d1 && d2 ? " (pinned)" : ""}`)
      continue
    }
    const r = await postBar(baseUrl, token, c.artist ?? args.artist, c, usedPairs)
    if (r.status === 201) {
      console.log(`  ✓ ${label} → ${r.body?.punchlineId ?? "?"}`)
      stats.ok++
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
    await new Promise((r) => setTimeout(r, args.delayMs))
  }

  console.log(`\nDone. created=${stats.ok} duplicates=${stats.dup} errors=${stats.err}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
