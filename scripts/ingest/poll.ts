/**
 * PUN-142/165: poll the playlist, process every new episode end-to-end into the
 * review queue. Idempotent — episodes already marked `done` are skipped.
 *
 *   pnpm ingest:poll                    # dry-run (no DB writes); prints what it would do
 *   pnpm ingest:poll --commit           # insert into the review queue (reviewed=false)
 *   pnpm ingest:poll --commit --auto-approve  # insert confident bars live (reviewed=true);
 *                                              # low-confidence ones still land in review
 *   pnpm ingest:poll --commit --limit 1 # cap how many new episodes to process this run
 */
import { MIN_EPISODE_SEC } from "./config.ts"
import { startRun, logEvent } from "./log.ts"
import { isNew, processEpisode } from "./pipeline.ts"
import { listEpisodes, ytDlpAvailable } from "./ytdlp.ts"

async function main() {
  const args = process.argv.slice(2)
  const commit = args.includes("--commit")
  const autoApprove = args.includes("--auto-approve")
  const limitArg = args.indexOf("--limit")
  const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity

  if (!(await ytDlpAvailable())) {
    throw new Error("yt-dlp not found. Install it (pipx install yt-dlp) or set YT_DLP_BIN.")
  }

  const runId = startRun()
  logEvent("ingest_run_started", { mode: commit ? "commit" : "dry-run", auto_approve: autoApprove, run_id: runId })

  const all = await listEpisodes()
  // Drop teasers/promos — only full episodes carry a quiz (PUN-141).
  const full = all.filter((ep) => ep.durationSec == null || ep.durationSec >= MIN_EPISODE_SEC)
  const shortSkipped = all.length - full.length
  if (shortSkipped > 0) console.log(`# skipped ${shortSkipped} short clip(s) (<${MIN_EPISODE_SEC}s, likely teasers)`)

  const fresh: Array<(typeof all)[number]> = []
  for (const ep of full) {
    if (await isNew(ep.videoId)) fresh.push(ep)
    if (fresh.length >= limit) break
  }
  console.log(`# ${all.length} quiz episodes in playlist, ${fresh.length} new to process${commit ? "" : " (dry-run)"}`)

  let inserted = 0
  let skipped = 0
  let failed = 0
  for (const ep of fresh) {
    const r = await processEpisode(ep, { commit, autoApprove })
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
    auto_approve: autoApprove,
  })
  if (!commit) console.log("\n# dry-run — no DB writes. Re-run with --commit to insert.")
  else if (autoApprove)
    console.log("\n# auto-approve: confident bars are live (reviewed=true); low-confidence bars are in /admin/review.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
