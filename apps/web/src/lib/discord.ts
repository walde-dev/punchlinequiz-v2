/**
 * Discord integration helpers — shared by the interactions endpoint
 * (slash commands) and the daily-post cron. Fully serverless: no gateway
 * connection, just Discord's REST + HTTP-interactions APIs.
 *
 * Env: DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, DISCORD_DAILY_CHANNEL_ID.
 */
import { createPublicKey, verify as edVerify } from "node:crypto"
import { eq, lte } from "drizzle-orm"
import { dailyChallenges, punchlines } from "@workspace/db"

import { db } from "./db"
import { SITE_URL } from "./seo"
import { getLeaderboard } from "./leaderboard"

// REST core lives in discord-rest.ts (dependency-light). Re-export for callers
// that already import these from this module (e.g. the daily cron).
export { discordRequest, postMessage } from "./discord-rest"

export const GOLD = 0xfbbf24 // the one brand accent

// ---------------------------------------------------------------------------
// Ed25519 signature verification (Discord signs every interaction request).
// We wrap the raw 32-byte public key in a DER SPKI header so node:crypto can
// build a key object — reliable across Node versions on Vercel.
// ---------------------------------------------------------------------------
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex")

export function verifyDiscordSignature(
  rawBody: string,
  signatureHex: string | null,
  timestamp: string | null
): boolean {
  const publicKeyHex = process.env.DISCORD_PUBLIC_KEY
  if (!publicKeyHex || !signatureHex || !timestamp) return false
  try {
    const key = createPublicKey({
      key: Buffer.concat([
        SPKI_ED25519_PREFIX,
        Buffer.from(publicKeyHex, "hex"),
      ]),
      format: "der",
      type: "spki",
    })
    const message = Buffer.from(timestamp + rawBody)
    const signature = Buffer.from(signatureHex, "hex")
    return edVerify(null, message, key, signature)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Daily challenge (broadcast-safe: only the bar line + sequential number, never
// the artist/song answer).
// ---------------------------------------------------------------------------
export type DailyBroadcast = { line: string; number: number; date: string }

function todayCET(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
}

export async function getDailyForBroadcast(): Promise<DailyBroadcast | null> {
  const date = todayCET()
  const rows = await db
    .select({ line: punchlines.line })
    .from(dailyChallenges)
    .innerJoin(punchlines, eq(punchlines.id, dailyChallenges.punchlineId))
    .where(eq(dailyChallenges.date, date))
    .limit(1)
  if (rows.length === 0) return null

  const numberRows = await db
    .select({ id: dailyChallenges.id })
    .from(dailyChallenges)
    .where(lte(dailyChallenges.date, date))
  return { line: rows[0].line, number: numberRows.length, date }
}

/** Render a bar for Discord — slashes become line breaks, wrapped in a quote. */
function formatBar(line: string): string {
  return line
    .split(/\s*\/\s*/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `> ${l}`)
    .join("\n")
}

// ---------------------------------------------------------------------------
// Message payloads
// ---------------------------------------------------------------------------
export function dailyPayload(daily: DailyBroadcast): Record<string, unknown> {
  return {
    embeds: [
      {
        title: `🔥 Punchline des Tages #${daily.number}`,
        description: `${formatBar(daily.line)}\n\nWer hat das gesagt? Aus welchem Song?\nBeweis es 👉 [punchlinequiz.de/daily](${SITE_URL}/daily)`,
        color: GOLD,
        url: `${SITE_URL}/daily`,
      },
    ],
  }
}

export function noDailyPayload(): Record<string, unknown> {
  return {
    content: `Heute ist noch keine Daily am Start. Zock solange den Klassiker 👉 ${SITE_URL}/play`,
  }
}

export function playPayload(): Record<string, unknown> {
  return {
    embeds: [
      {
        title: "🎤 Zeig was du draufhast",
        description: `Errate die fehlenden Lyrics. Flext eure Scores in #highscores.\n👉 [punchlinequiz.de/play](${SITE_URL}/play)`,
        color: GOLD,
        url: `${SITE_URL}/play`,
      },
    ],
  }
}

export async function leaderboardPayload(): Promise<Record<string, unknown>> {
  const result = await getLeaderboard({
    board: "xp",
    window: "weekly",
    callerId: null,
  })
  const top = result.top.slice(0, 10)
  if (top.length === 0) {
    return {
      content: `Noch keine Scores diese Woche. Sei der Erste 👉 ${SITE_URL}/play`,
    }
  }
  const medals = ["🥇", "🥈", "🥉"]
  const lines = top.map((e, i) => {
    const badge = medals[i] ?? `**${e.rank}.**`
    return `${badge} ${e.handle} — ${e.metric.toLocaleString("de-DE")} XP`
  })
  return {
    embeds: [
      {
        title: "🏆 Bestenliste — diese Woche",
        description: lines.join("\n"),
        color: GOLD,
        url: `${SITE_URL}/leaderboard`,
        footer: {
          text: "Voller Ranglisten-Talk auf punchlinequiz.de/leaderboard",
        },
      },
    ],
  }
}
