/**
 * One-shot backfill: for every punchline with a null cloze_prompt, derive a
 * default cloze by hiding the final word of the bar. The admin can refine
 * each line afterwards via the edit drawer.
 */
import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import { isNull, eq } from "drizzle-orm"
import { punchlines } from "../packages/db/src/schema.ts"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

// Load .env so DATABASE_URL is picked up automatically.
loadDotenv(path.join(ROOT, "apps/web/.env"))
loadDotenv(path.join(ROOT, ".env"))

function loadDotenv(filePath: string) {
  if (!fs.existsSync(filePath)) return
  for (const raw of fs.readFileSync(filePath, "utf8").split("\n")) {
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

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL missing")
const db = drizzle(neon(url))

/**
 * Given a line like "Ich chille in meinem Haus / und sehe eine Maus /",
 * returns:
 *   { prompt: "Ich chille in meinem Haus / und sehe eine ___ /", answer: "Maus" }
 *
 * Handles trailing " /" markers, trailing punctuation, and parenthetical
 * ad-libs at the end like "Maus (uh)".
 */
function deriveCloze(rawLine: string): { prompt: string; answer: string } | null {
  let line = rawLine.replace(/\s+/g, " ").trim()
  if (!line) return null

  // Strip trailing bar marker " /"
  const trailingSlash = line.endsWith("/")
  if (trailingSlash) line = line.replace(/\s*\/\s*$/, "").trim()
  if (!line) return null

  // Strip trailing parenthetical ad-libs like "(uh)" so we blank the real word.
  let parenthetical = ""
  const parenMatch = line.match(/\s*[([{][^)\]}]*[)\]}]\s*$/)
  if (parenMatch) {
    parenthetical = parenMatch[0]
    line = line.slice(0, parenMatch.index ?? 0).trimEnd()
  }

  // Strip trailing punctuation (.,!?;:—–-) but remember it.
  let trailingPunct = ""
  const punctMatch = line.match(/[.,!?;:—–-]+$/)
  if (punctMatch) {
    trailingPunct = punctMatch[0]
    line = line.slice(0, -trailingPunct.length).trimEnd()
  }

  // Last whitespace-separated token is the answer.
  const lastSpace = line.lastIndexOf(" ")
  if (lastSpace === -1) {
    // Single word line — too short for cloze, skip.
    return null
  }
  const answer = line.slice(lastSpace + 1)
  if (answer.length < 2) return null

  const head = line.slice(0, lastSpace)
  const prompt =
    `${head} ___${trailingPunct}${parenthetical}` + (trailingSlash ? " /" : "")
  return { prompt: prompt.replace(/\s+/g, " ").trim(), answer }
}

async function main() {
  const rows = await db
    .select({ id: punchlines.id, line: punchlines.line })
    .from(punchlines)
    .where(isNull(punchlines.clozePrompt))

  console.log(`→ ${rows.length} rows without cloze_prompt`)
  let ok = 0
  let skip = 0
  for (const r of rows) {
    const c = deriveCloze(r.line)
    if (!c) {
      skip++
      continue
    }
    await db
      .update(punchlines)
      .set({ clozePrompt: c.prompt, perfectSolution: [c.answer] })
      .where(eq(punchlines.id, r.id))
    ok++
  }
  console.log(`✓ backfilled ${ok}, skipped ${skip}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
