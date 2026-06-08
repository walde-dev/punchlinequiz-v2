import fs from "node:fs"
import path from "node:path"
import {
  MAX_VIDEO_HEIGHT,
  PLAYLIST_URL,
  TMP_DIR,
  YTDLP_PLAYER_CLIENT,
  isQuizEpisode,
} from "./config.ts"
import { run, runWithRetry, ytDlpCmd } from "./exec.ts"
import type { EpisodeMeta } from "./types.ts"

/**
 * PUN-142: list the playlist cheaply (metadata only, no media) and return the
 * episodes that pass `isQuizEpisode`. Uses `--flat-playlist` so it's one fast
 * network call regardless of playlist size.
 */
export async function listEpisodes(): Promise<Array<EpisodeMeta>> {
  const { cmd, baseArgs } = ytDlpCmd()
  const res = await runWithRetry(
    cmd,
    [
      ...baseArgs,
      "--flat-playlist",
      "--print",
      "%(id)s\t%(title)s\t%(duration)s",
      PLAYLIST_URL,
    ],
    { timeoutMs: 120_000, label: "yt-dlp playlist" },
  )
  const episodes: Array<EpisodeMeta> = []
  for (const line of res.stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [videoId, title, dur] = trimmed.split("\t")
    if (!videoId) continue
    const meta: EpisodeMeta = {
      videoId,
      title: title ?? "",
      durationSec: dur && dur !== "NA" ? Number(dur) : null,
    }
    if (isQuizEpisode(meta)) episodes.push(meta)
  }
  return episodes
}

/** Fetch a single video's metadata (title, duration). */
export async function episodeMeta(videoId: string): Promise<EpisodeMeta> {
  const { cmd, baseArgs } = ytDlpCmd()
  const res = await runWithRetry(
    cmd,
    [
      ...baseArgs,
      "--skip-download",
      "--print",
      "%(id)s\t%(title)s\t%(duration)s",
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    { timeoutMs: 60_000, label: "yt-dlp meta" },
  )
  const [id, title, dur] = res.stdout.trim().split("\t")
  return {
    videoId: id || videoId,
    title: title || "",
    durationSec: dur && dur !== "NA" ? Number(dur) : null,
  }
}

/**
 * PUN-145: download one episode at <=720p to a per-run temp dir. Returns the
 * mp4 path. The `android` player client avoids the 403/SABR wall. Caller is
 * responsible for cleanup via `cleanupRun`.
 */
export async function downloadEpisode(videoId: string): Promise<{ videoPath: string; runDir: string }> {
  const runDir = path.join(TMP_DIR, videoId)
  fs.mkdirSync(runDir, { recursive: true })
  const outTemplate = path.join(runDir, "video.%(ext)s")
  const { cmd, baseArgs } = ytDlpCmd()
  await runWithRetry(
    cmd,
    [
      ...baseArgs,
      "--extractor-args",
      `youtube:player_client=${YTDLP_PLAYER_CLIENT}`,
      "-f",
      `best[height<=${MAX_VIDEO_HEIGHT}][ext=mp4]/best[height<=${MAX_VIDEO_HEIGHT}]/18/best`,
      "-o",
      outTemplate,
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    { timeoutMs: 300_000, attempts: 3, label: "yt-dlp download" },
  )
  const file = fs
    .readdirSync(runDir)
    .map((f) => path.join(runDir, f))
    .find((f) => /\.(mp4|mkv|webm)$/.test(f))
  if (!file) throw new Error(`download produced no video file in ${runDir}`)
  return { videoPath: file, runDir }
}

/** Best-effort cleanup of a run's temp dir (video + frames). */
export function cleanupRun(runDir: string): void {
  try {
    fs.rmSync(runDir, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}

/** Whether yt-dlp is reachable at all (used for a friendly preflight error). */
export async function ytDlpAvailable(): Promise<boolean> {
  const { cmd, baseArgs } = ytDlpCmd()
  const res = await run(cmd, [...baseArgs, "--version"], { timeoutMs: 15_000 })
  return res.code === 0
}
