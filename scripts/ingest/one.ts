/**
 * PUN-165: process (or reprocess) a single episode by video id — for debugging
 * and re-runs. Ignores the processed ledger so you can re-run at will.
 *
 *   pnpm ingest:one <videoId>            # dry-run
 *   pnpm ingest:one <videoId> --commit   # insert into the review queue
 */
import { startRun, logEvent } from "./log.ts"
import { processEpisode } from "./pipeline.ts"
import { episodeMeta, ytDlpAvailable } from "./ytdlp.ts"

async function main() {
  const args = process.argv.slice(2)
  const commit = args.includes("--commit")
  const videoId = args.find((a) => !a.startsWith("--"))
  if (!videoId) throw new Error("usage: pnpm ingest:one <videoId> [--commit]")

  if (!(await ytDlpAvailable())) {
    throw new Error("yt-dlp not found. Install it (pipx install yt-dlp) or set YT_DLP_BIN.")
  }

  const runId = startRun()
  logEvent("ingest_run_started", { mode: commit ? "commit" : "dry-run", run_id: runId, single: videoId })

  const meta = await episodeMeta(videoId)
  const r = await processEpisode(meta, { commit })

  console.log(
    `\n# ${videoId} "${meta.title}" → ${r.insertedCount} inserted, ${r.skippedCount} dup, ${r.failedCount} failed${r.error ? ` (ERROR: ${r.error})` : ""}`,
  )
  for (const o of r.outcomes) {
    console.log(
      `  #${o.itemIndex} ${o.status}${o.correctArtist ? ` — ${o.correctArtist}` : ""}${o.songTitle ? ` / ${o.songTitle}` : ""}${o.punchlineId ? ` (bar ${o.punchlineId})` : ""}${o.error ? ` [${o.error}]` : ""}`,
    )
  }
  logEvent("ingest_run_finished", { run_id: runId, single: videoId, ...{ inserted: r.insertedCount, skipped: r.skippedCount, failed: r.failedCount }, commit })
  if (!commit) console.log("\n# dry-run — no DB writes. Re-run with --commit to insert.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
