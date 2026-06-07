import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { SAMPLE_FPS } from "./config.ts"
import { FFMPEG, run } from "./exec.ts"
import type { CandidateFrame } from "./types.ts"

/**
 * The quiz graphics live in the bottom band of the frame (punchline box,
 * 3-option stack, song-credit line, "X/10" counter). We crop to it: that's
 * where the signal is, and a band crop focuses Gemini's OCR (and cuts tokens)
 * vs the full talking-heads frame.
 */
const CROP = "crop=iw:ih*0.45:0:ih*0.55"

// Low-res gray grid used to measure frame-to-frame change.
const W = 32
const H = 18
const FB = W * H

/**
 * Segmentation strategy (PUN-148, revised — no full-frame scene-detect):
 *
 * A settled quiz overlay is a *static graphic* that holds for many seconds
 * (question card ~5-15s, reveal ~3-10s). Talking shots change every frame as
 * people move; the brief static moments between gestures are short. So we keep
 * only LONG static runs and take the middle frame of each. A static talking
 * shot that lasts long enough to slip through is harmless — it carries no
 * "X/10"/options, so the extractor drops it. Thresholds are env-tunable.
 */
const STATIC_T = Number(process.env.INGEST_STATIC_T ?? 3) // mean abs diff: < this = "still"
// 3 samples (~3s) catches the brief credit/counter reveal frame too. We favour
// recall — a missed frame loses content; an extra non-quiz frame is ~free since
// the extractor drops it. DEDUP_MAD stays low so a card and its green reveal
// (which differ only in a small region) survive as separate candidates.
const MIN_STATIC = Number(process.env.INGEST_MIN_STATIC ?? 2) // samples a still run must last
const DEDUP_MAD = Number(process.env.INGEST_DEDUP_MAD ?? 1.5) // merge candidates closer than this
const MAX_CANDIDATES = Number(process.env.INGEST_MAX_CANDIDATES ?? 150) // safety bound (logged if hit)

function mad(a: Buffer, b: Buffer): number {
  let s = 0
  for (let i = 0; i < FB; i++) s += Math.abs(a[i] - b[i])
  return s / FB
}

/** Cheap average-hash (mean threshold) of a gray buffer, hex — for debug/dedup display. */
function aHash(buf: Buffer): string {
  let mean = 0
  for (let i = 0; i < FB; i++) mean += buf[i]
  mean /= FB
  let bits = ""
  // Subsample to 64 bits (every Nth pixel) so the hash stays short.
  const step = Math.floor(FB / 64) || 1
  for (let i = 0, n = 0; i < FB && n < 64; i += step, n++) bits += buf[i] > mean ? "1" : "0"
  let hex = ""
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4).padEnd(4, "0"), 2).toString(16)
  return hex
}

/** One ffmpeg pass → tiny gray rawvideo at SAMPLE_FPS → per-sample buffers. */
function rawPass(videoPath: string): Promise<Array<Buffer>> {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-vf",
      `fps=${SAMPLE_FPS},${CROP},scale=${W}:${H},format=gray`,
      "-f",
      "rawvideo",
      "-",
    ]
    const child = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] })
    const chunks: Array<Buffer> = []
    let stderr = ""
    child.stdout!.on("data", (d: Buffer) => chunks.push(d))
    child.stderr!.on("data", (d: Buffer) => (stderr += d.toString()))
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg hash pass failed: ${stderr.slice(-300)}`))
      const buf = Buffer.concat(chunks)
      const out: Array<Buffer> = []
      const n = Math.floor(buf.length / FB)
      for (let i = 0; i < n; i++) out.push(buf.subarray(i * FB, (i + 1) * FB) as Buffer)
      resolve(out)
    })
  })
}

/** Indices of representative frames: middle of each long static run, deduped. */
function pickStaticRuns(buffers: Array<Buffer>): { picks: Array<number>; capped: boolean } {
  const picks: Array<number> = []
  let keptBufs: Array<Buffer> = []
  let runStart = 0
  for (let i = 1; i <= buffers.length; i++) {
    const broke = i === buffers.length || mad(buffers[i], buffers[i - 1]) >= STATIC_T
    if (broke) {
      const len = i - runStart
      if (len >= MIN_STATIC) {
        const mid = runStart + Math.floor(len / 2)
        const cand = buffers[mid]
        if (!keptBufs.some((b) => mad(b, cand) < DEDUP_MAD)) {
          picks.push(mid)
          keptBufs.push(cand)
        }
      }
      runStart = i
    }
  }
  const capped = picks.length > MAX_CANDIDATES
  return { picks: capped ? picks.slice(0, MAX_CANDIDATES) : picks, capped }
}

/** Extract a single cropped full-res JPEG at `tsMs`. */
async function extractFrame(videoPath: string, tsMs: number, outPath: string): Promise<void> {
  const res = await run(
    FFMPEG,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      (tsMs / 1000).toFixed(2),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-vf",
      CROP,
      "-y",
      outPath,
    ],
    { timeoutMs: 30_000 },
  )
  if (res.code !== 0) throw new Error(`ffmpeg frame extract failed @${tsMs}ms: ${res.stderr.slice(-200)}`)
}

/**
 * Segment an episode into candidate overlay frames. Returns cropped JPEGs +
 * timestamps + hashes under `runDir/frames`. `onCap` fires if the candidate
 * count hit MAX_CANDIDATES (so the caller can log the truncation — no silent caps).
 */
export async function segmentFrames(
  videoPath: string,
  runDir: string,
  onCap?: (kept: number) => void,
): Promise<Array<CandidateFrame>> {
  const framesDir = path.join(runDir, "frames")
  fs.mkdirSync(framesDir, { recursive: true })
  const buffers = await rawPass(videoPath)
  const { picks, capped } = pickStaticRuns(buffers)
  if (capped && onCap) onCap(picks.length)
  const candidates: Array<CandidateFrame> = []
  for (let i = 0; i < picks.length; i++) {
    const idx = picks[i]
    const tsMs = Math.round((idx * 1000) / SAMPLE_FPS)
    const outPath = path.join(framesDir, `cand_${String(i).padStart(3, "0")}_${tsMs}.jpg`)
    await extractFrame(videoPath, tsMs, outPath)
    candidates.push({ path: outPath, tsMs, hash: aHash(buffers[idx]) })
  }
  return candidates
}
