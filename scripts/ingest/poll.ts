/**
 * PUN-142/165: poll the playlist, process every new episode end-to-end into the
 * review queue. Idempotent — episodes already marked `done` are skipped.
 *
 *   pnpm ingest:poll            # dry-run (no DB writes); prints what it would do
 *   pnpm ingest:poll --commit   # actually insert into the review queue
 *   pnpm ingest:poll --limit 1  # cap how many new episodes to process this run
 */
import { startRun, logEvent } from "./log.ts"
import { isNew, processEpisode } from "./pipeline.ts"
import { listEpisodes, ytDlpAvailable } from "./ytdlp.ts"

async function main() {
  const args = process.argv.slice(2)
  const commit = args.includes("--commit")
  const limitArg = args.indexOf("--limit")
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity

  if (!(await ytDlpAvailable())) {
    throw new Error("yt-dlp not found. Install it (pipx install yt-dlp) or set YT_DLP_BIN.")
  }

  const runId = startRun()
  logEvent("ingest_run_started", { mode: commit ? "commit" : "dry-run", run_id: runId })

  const all = await listEpisodes()
  const fresh: Array<(typeof all)[number]> = []
  for (const ep of all) {
    if (await isNew(ep.videoId)) fresh.push(ep)
    if (fresh.length >= limit) break
  }
  console.log(`# ${all.length} quiz episodes in playlist, ${fresh.length} new to process${commit ? "" : " (dry-run)"}`)

  let inserted = 0
  let skipped = 0
  let failed = 0
  for (const ep of fresh) {
    const r = await processEpisode(ep, { commit })
    inserted += r.insertedCount
    skipped += r.skippedCount
    failed += r.failedCount
    console.log(
      `# ${ep.videoId} "${ep.title}" → ${r.insertedCount} inserted, ${r.skippedCount} dup, ${r.failedCount} failed${r.error ? ` (ERROR: ${r.error})` : ""}`,
    )
  }

  logEvent("ingest_run_finished", {
    run_id: runId,
    episodes: fresh.length,
    inserted,
    skipped,
    failed,
    commit,
  })
  if (!commit) console.log("\n# dry-run — no DB writes. Re-run with --commit to insert.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
