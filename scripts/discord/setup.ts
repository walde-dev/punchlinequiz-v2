/**
 * Idempotent PunchlineQuiz Discord server setup.
 *
 * Builds the community server from a declarative desired-state: categories,
 * channels, roles, permission overwrites, and server settings. Safe to re-run
 * — everything is matched by name (create-if-missing), existing default
 * channels are adopted/renamed rather than duplicated, and nothing is deleted
 * except the now-empty Discord default categories.
 *
 *   pnpm discord:setup
 *
 * Requires DISCORD_BOT_TOKEN + DISCORD_GUILD_ID in .env (already there).
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
const GUILD = process.env.DISCORD_GUILD_ID
if (!TOKEN) throw new Error("DISCORD_BOT_TOKEN missing")
if (!GUILD) throw new Error("DISCORD_GUILD_ID missing")

const API = "https://discord.com/api/v10"

// --- permission bit flags (BigInt) ---
const P = {
  ADMINISTRATOR: 1n << 3n,
  KICK_MEMBERS: 1n << 1n,
  MANAGE_MESSAGES: 1n << 13n,
  MANAGE_THREADS: 1n << 34n,
  MODERATE_MEMBERS: 1n << 40n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
}
const bits = (...flags: bigint[]) =>
  flags.reduce((a, b) => a | b, 0n).toString()

// channel types
const TEXT = 0
const VOICE = 2
const CATEGORY = 4

// brand colors
const GOLD = 0xfbbf24 // 16498468 — Admin (the one accent)
const BRONZE = 0xb8945f // 12096607 — OG, a muted shade of the accent
const NEUTRAL = 0 // Team — default/neutral

// ---- rate-limit-aware fetch ----
async function api(
  method: string,
  route: string,
  body?: unknown
): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}${route}`, {
      method,
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}))
      const wait = Math.ceil((data.retry_after ?? 1) * 1000) + 250
      console.log(`  …rate limited, waiting ${wait}ms`)
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${method} ${route} → ${res.status}: ${text}`)
    }
    if (res.status === 204) return null
    return res.json()
  }
  throw new Error(`${method} ${route} → gave up after repeated 429s`)
}

// ---- desired state ----
type ChannelSpec = {
  name: string
  type: number
  adopt?: string
  topic?: string
}
type CategorySpec = {
  name: string
  readOnly?: boolean
  /** Hidden from @everyone. Only roles with Administrator (Admin, the bot) see it. */
  adminOnly?: boolean
  channels: ChannelSpec[]
}

const LAYOUT: CategorySpec[] = [
  {
    name: "📌 START",
    readOnly: true,
    channels: [
      {
        name: "willkommen",
        type: TEXT,
        topic: "Was das hier ist + die Regeln. Lies das einmal.",
      },
      {
        name: "ankündigungen",
        type: TEXT,
        adopt: "updates",
        topic: "Neue Artists, Features, Updates.",
      },
      {
        name: "punchline-des-tages",
        type: TEXT,
        topic:
          "Jeden Tag um 18:00 die neue Daily-Bar. Spiel auf punchlinequiz.de/daily",
      },
    ],
  },
  {
    name: "🎤 DEUTSCHRAP",
    channels: [
      {
        name: "allgemein",
        type: TEXT,
        adopt: "general",
        topic: "Allgemeiner Talk.",
      },
      { name: "releases", type: TEXT, topic: "Neue Drops, Alben, Tapes." },
      { name: "bars", type: TEXT, topic: "Poste deine härtesten Punchlines." },
    ],
  },
  {
    name: "🎮 DAS QUIZ",
    channels: [
      {
        name: "highscores",
        type: TEXT,
        topic: "Flext eure Ergebnisse + Share-Cards.",
      },
      {
        name: "bar-vorschläge",
        type: TEXT,
        topic: "Schlag Bars für die App vor.",
      },
    ],
  },
  {
    name: "🛠️ FEEDBACK",
    channels: [
      {
        name: "ideen-feedback",
        type: TEXT,
        adopt: "ideas",
        topic: "Feature-Wünsche + Feedback.",
      },
      { name: "bugs", type: TEXT, topic: "Was kaputt ist." },
    ],
  },
  {
    name: "🔊 VOICE",
    channels: [{ name: "Lobby", type: VOICE, adopt: "General" }],
  },
  {
    // Admin-only: hidden from @everyone; Administrator roles (Admin + bot) auto-see it.
    name: "🔒 STAFF",
    adminOnly: true,
    channels: [
      { name: "logs", type: TEXT, topic: "App-Events (Server-Logs)." },
      { name: "alerts", type: TEXT, topic: "Fehler & wichtige Alerts." },
      {
        name: "review-queue",
        type: TEXT,
        topic: "Neue Bar-Vorschläge zum Prüfen.",
      },
      {
        name: "bot-status",
        type: TEXT,
        topic: "Daily-Post-Bestätigungen & Cron-Heartbeat.",
      },
    ],
  },
]

type RoleSpec = {
  name: string
  color: number
  hoist: boolean
  permissions: string
  mentionable?: boolean
}
const ROLES: RoleSpec[] = [
  {
    name: "Admin",
    color: GOLD,
    hoist: true,
    permissions: bits(P.ADMINISTRATOR),
  },
  {
    name: "Team",
    color: NEUTRAL,
    hoist: true,
    permissions: bits(
      P.MANAGE_MESSAGES,
      P.KICK_MEMBERS,
      P.MODERATE_MEMBERS,
      P.MANAGE_THREADS
    ),
  },
  {
    name: "OG",
    color: BRONZE,
    hoist: true,
    permissions: "0",
    mentionable: true,
  },
]

const norm = (s: string) => s.trim().toLowerCase()

/**
 * @everyone overwrite for a category/its channels. adminOnly hides it entirely;
 * readOnly leaves it visible but unpostable. Administrator roles (Admin + bot)
 * bypass both. Returns undefined for normal categories (inherit defaults).
 */
function overwritesFor(cat: CategorySpec) {
  if (cat.adminOnly) {
    return [{ id: GUILD, type: 0, allow: "0", deny: bits(P.VIEW_CHANNEL) }]
  }
  if (cat.readOnly) {
    return [
      {
        id: GUILD,
        type: 0,
        allow: bits(P.VIEW_CHANNEL),
        deny: bits(
          P.SEND_MESSAGES,
          P.SEND_MESSAGES_IN_THREADS,
          P.CREATE_PUBLIC_THREADS,
          P.CREATE_PRIVATE_THREADS
        ),
      },
    ]
  }
  return undefined
}

async function main() {
  console.log(`\n🎤 Setting up PunchlineQuiz Discord (guild ${GUILD})\n`)

  // ---------- fetch current state ----------
  const guild = await api("GET", `/guilds/${GUILD}`)
  let channels: any[] = await api("GET", `/guilds/${GUILD}/channels`)
  const byName = (n: string) => channels.find((c) => norm(c.name) === norm(n))

  // ---------- categories ----------
  const catIds: Record<string, string> = {}
  for (let i = 0; i < LAYOUT.length; i++) {
    const cat = LAYOUT[i]
    const catOverwrites = overwritesFor(cat)
    let existing = channels.find(
      (c) => c.type === CATEGORY && norm(c.name) === norm(cat.name)
    )
    if (existing) {
      await api("PATCH", `/channels/${existing.id}`, {
        position: i,
        ...(catOverwrites ? { permission_overwrites: catOverwrites } : {}),
      })
      console.log(`= category ${cat.name}`)
    } else {
      existing = await api("POST", `/guilds/${GUILD}/channels`, {
        name: cat.name,
        type: CATEGORY,
        position: i,
        ...(catOverwrites ? { permission_overwrites: catOverwrites } : {}),
      })
      channels.push(existing)
      console.log(`+ category ${cat.name}`)
    }
    catIds[cat.name] = existing.id
  }

  // ---------- channels ----------
  const channelIds: Record<string, string> = {}
  for (const cat of LAYOUT) {
    const overwrites = overwritesFor(cat)

    for (let j = 0; j < cat.channels.length; j++) {
      const spec = cat.channels[j]
      let ch = byName(spec.name)
      if (!ch && spec.adopt) {
        const alias = byName(spec.adopt)
        if (alias && alias.type === spec.type) {
          ch = await api("PATCH", `/channels/${alias.id}`, { name: spec.name })
          channels = channels.map((c) => (c.id === ch.id ? ch : c))
          console.log(`~ #${spec.adopt} → #${spec.name} (adopted)`)
        }
      }
      if (!ch) {
        ch = await api("POST", `/guilds/${GUILD}/channels`, {
          name: spec.name,
          type: spec.type,
          parent_id: catIds[cat.name],
          position: j,
          ...(spec.topic ? { topic: spec.topic } : {}),
          ...(overwrites ? { permission_overwrites: overwrites } : {}),
        })
        channels.push(ch)
        console.log(`+ #${spec.name}`)
      } else {
        await api("PATCH", `/channels/${ch.id}`, {
          parent_id: catIds[cat.name],
          position: j,
          ...(spec.topic ? { topic: spec.topic } : {}),
          ...(overwrites ? { permission_overwrites: overwrites } : {}),
        })
        console.log(`= #${spec.name}`)
      }
      channelIds[spec.name] = ch.id
    }
  }

  // ---------- roles ----------
  let roles: any[] = await api("GET", `/guilds/${GUILD}/roles`)
  const roleIds: Record<string, string> = {}
  for (const spec of ROLES) {
    let role = roles.find((r) => norm(r.name) === norm(spec.name) && !r.managed)
    const payload = {
      name: spec.name,
      color: spec.color,
      hoist: spec.hoist,
      permissions: spec.permissions,
      mentionable: spec.mentionable ?? false,
    }
    if (role) {
      role = await api("PATCH", `/guilds/${GUILD}/roles/${role.id}`, payload)
      console.log(`= role ${spec.name}`)
    } else {
      role = await api("POST", `/guilds/${GUILD}/roles`, payload)
      console.log(`+ role ${spec.name}`)
    }
    roleIds[spec.name] = role.id
  }

  // order roles: Admin > Team > OG (best-effort; bot can only place below itself)
  roles = await api("GET", `/guilds/${GUILD}/roles`)
  const botRole =
    roles.find((r) => r.managed && r.tags?.bot_id === guild.application_id) ||
    roles.find((r) => r.managed)
  const botPos = botRole?.position ?? roles.length
  try {
    await api("PATCH", `/guilds/${GUILD}/roles`, [
      { id: roleIds["Admin"], position: Math.max(1, botPos - 1) },
      { id: roleIds["Team"], position: Math.max(1, botPos - 2) },
      { id: roleIds["OG"], position: Math.max(1, botPos - 3) },
    ])
    console.log(`= role order applied (below bot @ pos ${botPos})`)
  } catch (e) {
    console.log(
      `! could not reorder roles (cosmetic only): ${(e as Error).message}`
    )
  }

  // assign Admin to the server owner
  if (guild.owner_id) {
    try {
      await api(
        "PUT",
        `/guilds/${GUILD}/members/${guild.owner_id}/roles/${roleIds["Admin"]}`
      )
      console.log(`= Admin assigned to owner`)
    } catch (e) {
      console.log(`! could not assign Admin to owner: ${(e as Error).message}`)
    }
  }

  // ---------- server settings ----------
  await api("PATCH", `/guilds/${GUILD}`, {
    verification_level: 1, // verified email required
    explicit_content_filter: 2, // scan all members
    system_channel_id: channelIds["willkommen"], // join messages land here
    system_channel_flags: 0, // 0 = all system messages (incl. join) enabled
  })
  console.log(
    `= server settings (verification, content filter, join → #willkommen)`
  )

  // ---------- delete now-empty Discord default categories ----------
  const after: any[] = await api("GET", `/guilds/${GUILD}/channels`)
  const ours = new Set(Object.values(catIds))
  for (const c of after) {
    if (c.type !== CATEGORY || ours.has(c.id)) continue
    const isDefault = ["text channels", "voice channels"].includes(norm(c.name))
    const hasChildren = after.some((x) => x.parent_id === c.id)
    if (isDefault && !hasChildren) {
      await api("DELETE", `/channels/${c.id}`)
      console.log(`- removed empty default category "${c.name}"`)
    }
  }

  // ---------- persist ids for phase 2 (bot code) ----------
  const out = {
    guildId: GUILD,
    ownerId: guild.owner_id,
    channels: channelIds,
    roles: roleIds,
  }
  const ctxDir = path.join(ROOT, ".context")
  fs.mkdirSync(ctxDir, { recursive: true })
  fs.writeFileSync(
    path.join(ctxDir, "discord-ids.json"),
    JSON.stringify(out, null, 2)
  )

  console.log(`\n✅ Done. IDs written to .context/discord-ids.json\n`)
  console.log(`Add to Vercel env (phase 2):`)
  console.log(`  DISCORD_GUILD_ID=${GUILD}`)
  console.log(`  DISCORD_DAILY_CHANNEL_ID=${channelIds["punchline-des-tages"]}`)

  const stray =
    ROLES.length && roles.find((r) => norm(r.name) === "punchline/quiz team")
  if (stray) {
    console.log(
      `\nℹ️  Existing role "punchline/quiz team" left untouched (sits at/above the bot's role).`
    )
    console.log(
      `   Delete it by hand if it's redundant with the new "Team" role.`
    )
  }
}

main().catch((e) => {
  console.error("\n❌ setup failed:", e)
  process.exit(1)
})
