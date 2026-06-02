/**
 * Post (or update) the #willkommen rules + #ankündigungen launch post.
 *
 *   pnpm discord:post-welcome
 *
 * Idempotent: if the bot already has a message in the target channel it edits
 * it in place rather than posting a duplicate. Tweak the copy below and re-run.
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
const APP_ID = process.env.DISCORD_APPLICATION_ID // bot user id == application id
if (!TOKEN || !APP_ID)
  throw new Error("DISCORD_BOT_TOKEN + DISCORD_APPLICATION_ID required")

const ids = JSON.parse(
  fs.readFileSync(path.join(ROOT, ".context/discord-ids.json"), "utf8")
) as { channels: Record<string, string> }

const GOLD = 0xfbbf24

async function api(
  method: string,
  route: string,
  body?: unknown
): Promise<any> {
  const res = await fetch(`https://discord.com/api/v10${route}`, {
    method,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok)
    throw new Error(`${method} ${route} → ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

/** Post the embed, or edit the bot's existing message in that channel. */
async function upsert(
  channelId: string,
  payload: Record<string, unknown>,
  label: string
) {
  const recent: any[] = await api(
    "GET",
    `/channels/${channelId}/messages?limit=50`
  )
  const mine = recent.find((m) => m.author?.id === APP_ID)
  if (mine) {
    await api("PATCH", `/channels/${channelId}/messages/${mine.id}`, payload)
    console.log(`= updated ${label}`)
  } else {
    await api("POST", `/channels/${channelId}/messages`, payload)
    console.log(`+ posted ${label}`)
  }
}

const willkommen = {
  embeds: [
    {
      title: "Willkommen bei punchline/quiz 🎤",
      description: [
        "Das hier ist der Treffpunkt für alle, die deutschen Rap **wirklich** kennen.",
        "Bars raten, Scores flexen, über den GOAT streiten. Du solltest das wissen — mal sehen.",
        "",
        "**So läuft's:**",
        "🔥 <#" +
          ids.channels["punchline-des-tages"] +
          "> — jeden Tag um 18 Uhr die neue Daily-Bar",
        "🏆 <#" +
          ids.channels["highscores"] +
          "> — flext eure Ergebnisse & Share-Cards",
        "🎵 <#" + ids.channels["bars"] + "> — postet eure härtesten Punchlines",
        "💡 <#" +
          ids.channels["bar-vorschläge"] +
          "> — schlagt Bars für die App vor",
        "🛠️ <#" +
          ids.channels["ideen-feedback"] +
          "> & <#" +
          ids.channels["bugs"] +
          "> — sagt uns was fehlt oder kaputt ist",
        "",
        "**Regeln:**",
        "1. Respekt zuerst. Roast die Bars, nicht die Leute.",
        "2. Kein Spam, keine Eigenwerbung ohne Absprache.",
        "3. Daily-Antworten gehören hinter Spoiler-Tags: `||so||`.",
        "4. Bleib beim Thema im jeweiligen Channel.",
        "5. Was das Team sagt, gilt.",
        "",
        "Jetzt zeig, dass du dazugehörst 👉 https://punchlinequiz.de",
      ].join("\n"),
      color: GOLD,
    },
  ],
}

const ankuendigung = {
  embeds: [
    {
      title: "Es geht los. 🔥",
      description: [
        "**punchline/quiz** ist das Quiz für die echte deutsche Rap-Szene.",
        "Wir füllen die Lücken in den härtesten Bars — und finden raus, wer sie wirklich kennt.",
        "",
        "Jeden Tag um **18 Uhr** droppt hier die neue Daily. Streak halten, Leute einladen, ganz oben stehen.",
        "",
        "Spiel jetzt 👉 https://punchlinequiz.de",
      ].join("\n"),
      color: GOLD,
    },
  ],
}

async function main() {
  await upsert(ids.channels["willkommen"], willkommen, "#willkommen")
  await upsert(ids.channels["ankündigungen"], ankuendigung, "#ankündigungen")
  console.log("\n✅ done")
}

main().catch((e) => {
  console.error("❌", e)
  process.exit(1)
})
