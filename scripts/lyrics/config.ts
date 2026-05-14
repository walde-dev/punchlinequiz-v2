import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const ROOT = path.resolve(__dirname, "../..")
export const DATA_DIR = path.join(__dirname, "data")

// apps/web/.env first (matches dev server); root .env fills any gaps.
loadDotenv(path.join(ROOT, "apps/web/.env"))
loadDotenv(path.join(ROOT, ".env"))

function loadDotenv(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, "utf8")
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

let cachedToken: string | null = null

export async function geniusToken(): Promise<string> {
  if (cachedToken) return cachedToken
  const direct = process.env.GENIUS_ACCESS_TOKEN || process.env.GENIUS_API_TOKEN
  if (direct) {
    cachedToken = direct
    return direct
  }
  const clientId = process.env.NEXT_PUBLIC_GENIUS_CLIENT_ID
  const clientSecret = process.env.GENIUS_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      "Genius credentials missing. Set NEXT_PUBLIC_GENIUS_CLIENT_ID + GENIUS_CLIENT_SECRET in .env " +
        "(register at https://genius.com/api-clients), or set GENIUS_ACCESS_TOKEN directly.",
    )
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch("https://api.genius.com/oauth/token", {
    method: "POST",
    body,
  })
  if (!res.ok) {
    throw new Error(`Genius OAuth failed: ${res.status} ${await res.text().catch(() => "")}`)
  }
  const json = (await res.json()) as { access_token: string }
  cachedToken = json.access_token
  return cachedToken
}

export function adminConfig() {
  const baseUrl = process.env.PQUIZ_BASE_URL || "http://localhost:3000"
  const token = process.env.PQUIZ_ADMIN_TOKEN
  if (!token) throw new Error("PQUIZ_ADMIN_TOKEN missing in .env")
  return { baseUrl, token }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function artistDir(artist: string): string {
  return path.join(DATA_DIR, slugify(artist))
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

export { pickDistractorsSmart, analyzePunchline, tagOverlap, allArtists } from "./tags.ts"

import { pickDistractorsSmart, type PickOptions } from "./tags.ts"

/**
 * Backwards-compatible shim. Prefer `pickDistractorsSmart` directly so callers
 * can pass punchline text + used-pair tracking.
 */
export function pickDistractors(
  artist: string,
  punchline = "",
  song?: string,
  opts: PickOptions = {},
): [string, string] {
  return pickDistractorsSmart(artist, punchline, song, opts)
}
