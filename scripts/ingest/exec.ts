import { spawn } from "node:child_process"

/** Resolve the yt-dlp invocation: prefer a `yt-dlp` binary, else `python3 -m yt_dlp`. */
export function ytDlpCmd(): { cmd: string; baseArgs: Array<string> } {
  if (process.env.YT_DLP_BIN) return { cmd: process.env.YT_DLP_BIN, baseArgs: [] }
  return { cmd: "python3", baseArgs: ["-m", "yt_dlp"] }
}

export const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg"
export const FFPROBE = process.env.FFPROBE_BIN || "ffprobe"

export type RunResult = { stdout: string; stderr: string; code: number }

/** Run a command to completion, capturing stdout/stderr. Never throws on non-zero. */
export function run(
  cmd: string,
  args: Array<string>,
  opts: { timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let timer: NodeJS.Timeout | undefined
    if (opts.timeoutMs) {
      timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
    }
    child.stdout.on("data", (d) => (stdout += d.toString()))
    child.stderr.on("data", (d) => (stderr += d.toString()))
    child.on("error", (e) => {
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr: stderr + String(e), code: 127 })
    })
    child.on("close", (code) => {
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr, code: code ?? 0 })
    })
  })
}

/** Run with retries + exponential backoff; throws after the final attempt (PUN-168). */
export async function runWithRetry(
  cmd: string,
  args: Array<string>,
  opts: { timeoutMs?: number; attempts?: number; label?: string } = {},
): Promise<RunResult> {
  const attempts = opts.attempts ?? 3
  let last: RunResult | undefined
  for (let i = 0; i < attempts; i++) {
    last = await run(cmd, args, { timeoutMs: opts.timeoutMs })
    if (last.code === 0) return last
    if (i < attempts - 1) {
      const backoff = 1000 * Math.pow(2, i)
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
  throw new Error(
    `${opts.label ?? cmd} failed after ${attempts} attempts (code ${last?.code}): ${last?.stderr.slice(-400)}`,
  )
}
