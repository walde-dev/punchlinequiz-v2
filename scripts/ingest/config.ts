import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
// Importing lyrics/config triggers its .env loader (apps/web/.env then root .env)
// as a side effect and gives us the shared Genius token resolver.
export { geniusToken } from "../lyrics/config.ts"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, "../..")

/** PUN-141: canonical poll source = the "Das Punchline Quiz" playlist. */
export const PLAYLIST_ID = "PLSIJaK3u-v9bcZtsUf8pT5aZ3XAaovi3C"
export const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`

/**
 * PUN-141: title predicate admitting only genuine Punchline-Quiz episodes.
 * Belt-and-suspenders on top of the already-curated playlist (matches
 * "Punchline Quiz", "Punchline-Quiz", "in the Punchline Quiz", …).
 */
export function isQuizEpisode(meta: { title?: string | null }): boolean {
  return /punchline[\s-]*quiz/i.test(meta.title ?? "")
}

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} missing in .env`)
  return v
}

/** PUN-171 accuracy gate targets (fraction of golden-set items correct). */
export const ACCURACY_TARGETS = { correctAnswer: 0.95, line: 0.9, options: 0.9 } as const

/** Items below this extractor confidence are flagged 'low_confidence' (never dropped). */
export const LOW_CONFIDENCE = 0.6

/** Skip clips shorter than this — they're teasers/promos, not full quiz episodes. */
export const MIN_EPISODE_SEC = 120

/** Frame sampling cadence (fps) and download cap (px) — 720p is plenty for OCR. */
export const SAMPLE_FPS = 1
export const MAX_VIDEO_HEIGHT = 720

/**
 * yt-dlp player client. `android` bypasses the SABR/403 wall that the default
 * web client hits for these uploads (verified on the channel). Override with
 * YT_DLP_PLAYER_CLIENT if YouTube changes the goalposts.
 */
export const YTDLP_PLAYER_CLIENT = process.env.YT_DLP_PLAYER_CLIENT || "android"

/** Working area for downloaded video + extracted frames; cleaned per episode. */
export const TMP_DIR = process.env.INGEST_TMP_DIR || path.join(os.tmpdir(), "whodat-ingest")

/** Gemini vision model + endpoint (PUN-151 chosen provider). */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"
