import { ingestDb } from "./db.ts"
import { extractQuizItems } from "./extract.ts"
import { segmentFrames } from "./frames.ts"
import { hasProcessed, markDone, markFailed, markProcessing, type EpisodeCounts } from "./ledger.ts"
import { logEvent } from "./log.ts"
import { persistItem } from "./persist.ts"
import type { EpisodeMeta, PersistOutcome } from "./types.ts"
import { cleanupRun, downloadEpisode } from "./ytdlp.ts"

export type EpisodeResult = EpisodeCounts & {
  videoId: string
  outcomes: Array<PersistOutcome>
  error?: string
}

function tally(outcomes: Array<PersistOutcome>): EpisodeCounts {
  return {
    itemCount: outcomes.length,
    // Both 'inserted' and 'low_confidence' mint a bar.
    insertedCount: outcomes.filter((o) => o.status === "inserted" || o.status === "low_confidence").length,
    skippedCount: outcomes.filter((o) => o.status === "duplicate").length,
    failedCount: outcomes.filter((o) => o.status === "failed").length,
  }
}

/**
 * Process one episode end-to-end (A→F): download → segment → extract → resolve
 * → persist. Catches its own errors (marks the episode failed, logs, returns)
 * so a batch keeps going. Cleans up the temp dir on success and failure.
 */
export async function processEpisode(
  meta: EpisodeMeta,
  opts: { commit: boolean; autoApprove?: boolean },
): Promise<EpisodeResult> {
  const db = ingestDb()
  const { videoId, title } = meta
  const t0 = Date.now()
  logEvent("episode_processing_started", { video_id: videoId, title, commit: opts.commit })
  if (opts.commit) await markProcessing(db, videoId, title)

  let runDir: string | undefined
  try {
    const dl = await downloadEpisode(videoId)
    runDir = dl.runDir
    const tDl = Date.now()

    const frames = await segmentFrames(dl.videoPath, dl.runDir, (kept) =>
      logEvent("episode_frames_capped", { video_id: videoId, kept }),
    )
    const tSeg = Date.now()

    const items = await extractQuizItems(frames)
    const tExtract = Date.now()
    logEvent("episode_extracted", {
      video_id: videoId,
      candidate_frames: frames.length,
      items: items.length,
      ms_download: tDl - t0,
      ms_segment: tSeg - tDl,
      ms_extract: tExtract - tSeg,
    })

    // Guard against silently burying a real episode: lots of candidate frames
    // but zero extracted items means extraction failed (e.g. a transient
    // Gemini outage), not that the episode is empty. Mark it failed (retryable)
    // rather than done. A genuinely empty/non-quiz clip yields few frames.
    if (items.length === 0 && frames.length >= 20) {
      const error = `0 items from ${frames.length} candidate frames — extraction failure, retryable`
      if (opts.commit) await markFailed(db, videoId, error).catch(() => {})
      logEvent("episode_failed", { video_id: videoId, error })
      return { videoId, itemCount: 0, insertedCount: 0, skippedCount: 0, failedCount: 0, outcomes: [], error }
    }

    const outcomes: Array<PersistOutcome> = []
    for (let i = 0; i < items.length; i++) {
      const outcome = await persistItem(db, videoId, items[i], i, opts)
      outcomes.push(outcome)
      const ev =
        outcome.status === "duplicate"
          ? "item_skipped_duplicate"
          : outcome.status === "failed"
            ? "item_failed"
            : "item_extracted"
      logEvent(ev, {
        video_id: videoId,
        item_index: outcome.itemIndex,
        status: outcome.status,
        confidence: items[i].confidence,
        correct_artist: outcome.correctArtist,
        song_title: outcome.songTitle,
        punchline_id: outcome.punchlineId,
        error: outcome.error,
      })
    }

    const counts = tally(outcomes)
    if (opts.commit) await markDone(db, videoId, counts)
    logEvent("episode_processed", {
      video_id: videoId,
      ...counts,
      ms_total: Date.now() - t0,
      commit: opts.commit,
    })
    return { videoId, ...counts, outcomes }
  } catch (e) {
    const error = String(e).slice(0, 500)
    if (opts.commit) await markFailed(db, videoId, error).catch(() => {})
    logEvent("episode_failed", { video_id: videoId, error })
    return { videoId, itemCount: 0, insertedCount: 0, skippedCount: 0, failedCount: 0, outcomes: [], error }
  } finally {
    if (runDir) cleanupRun(runDir)
  }
}

/** Skip episodes already marked done (idempotency); used by the poller. */
export async function isNew(videoId: string): Promise<boolean> {
  return !(await hasProcessed(ingestDb(), videoId))
}
