/**
 * Register PunchlineQuiz slash commands with Discord (guild-scoped → instant).
 *
 *   pnpm discord:register
 *
 * Re-run whenever the command set below changes. Guild commands update
 * immediately (global commands can take up to an hour). Requires
 * DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID in .env.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "../..")
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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

const TOKEN = process.env.DISCORD_BOT_TOKEN
const APP_ID = process.env.DISCORD_APPLICATION_ID
const GUILD = process.env.DISCORD_GUILD_ID
if (!TOKEN || !APP_ID || !GUILD) {
  throw new Error(
    "DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID required"
  )
}

// CHAT_INPUT commands. dm_permission false = guild-only.
const COMMANDS = [
  {
    name: "daily",
    description: "Zeig die heutige Punchline des Tages",
    type: 1,
    dm_permission: false,
  },
  { name: "play", description: "Link zum Quiz", type: 1, dm_permission: false },
  {
    name: "leaderboard",
    description: "Top 10 der Woche",
    type: 1,
    dm_permission: false,
  },
]

async function main() {
  const res = await fetch(
    `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD}/commands`,
    {
      method: "PUT", // bulk-overwrite: declarative, idempotent
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(COMMANDS),
    }
  )
  if (!res.ok)
    throw new Error(`register failed → ${res.status}: ${await res.text()}`)
  const registered = (await res.json()) as Array<{ name: string }>
  console.log(
    `✅ Registered ${registered.length} commands: ${registered.map((c) => "/" + c.name).join(", ")}`
  )
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
