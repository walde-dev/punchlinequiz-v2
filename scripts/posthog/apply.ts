/**
 * PUN-43 — Apply the version-controlled dashboards in dashboards.ts to PostHog.
 *
 * Idempotent: insights are upserted by name, then attached to the launch
 * dashboard (also matched by name). Re-run after editing dashboards.ts to push
 * changes — analytics as code.
 *
 *   tsx scripts/posthog/apply.ts
 *
 * Requires in .env:
 *   POSTHOG_PERSONAL_API_KEY  personal API key with insight/dashboard write
 *                             (Project API key is NOT enough for the write API)
 *   POSTHOG_PROJECT_ID        numeric project id
 *   POSTHOG_HOST              api host, e.g. https://eu.posthog.com (default EU)
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { DASHBOARD, INSIGHTS } from "./dashboards"

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

const KEY = process.env.POSTHOG_PERSONAL_API_KEY
const PROJECT = process.env.POSTHOG_PROJECT_ID
// The REST API lives on the APP host (eu.posthog.com), NOT the ingest host
// (eu.i.posthog.com) that POSTHOG_HOST points at. Derive it.
const HOST = (process.env.POSTHOG_API_HOST ?? process.env.POSTHOG_HOST ?? "https://eu.posthog.com")
  .replace(/\/\/(eu|us)\.i\.posthog\.com/, "//$1.posthog.com")
  .replace(/\/$/, "")
if (!KEY) throw new Error("POSTHOG_PERSONAL_API_KEY missing")
if (!PROJECT) throw new Error("POSTHOG_PROJECT_ID missing")

const base = `${HOST}/api/projects/${PROJECT}`
const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }

async function api<T>(pathname: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${pathname}`, { ...init, headers })
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${pathname} → ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

type Named = { id: number; name: string }

/** Find an existing item by exact name across the paginated list endpoint. */
async function findByName(endpoint: string, name: string): Promise<Named | null> {
  const data = await api<{ results: Named[] }>(`${endpoint}?search=${encodeURIComponent(name)}&limit=100`)
  return data.results.find((r) => r.name === name) ?? null
}

async function upsertDashboard(): Promise<number> {
  const existing = await findByName("/dashboards/", DASHBOARD.name)
  if (existing) {
    console.log(`• dashboard exists: ${DASHBOARD.name} (#${existing.id})`)
    return existing.id
  }
  const created = await api<Named>("/dashboards/", { method: "POST", body: JSON.stringify(DASHBOARD) })
  console.log(`+ dashboard created: ${DASHBOARD.name} (#${created.id})`)
  return created.id
}

async function upsertInsight(dashboardId: number, insight: (typeof INSIGHTS)[number]) {
  const body = { ...insight, dashboards: [dashboardId] }
  const existing = await findByName("/insights/", insight.name)
  if (existing) {
    await api(`/insights/${existing.id}/`, { method: "PATCH", body: JSON.stringify(body) })
    console.log(`• insight updated: ${insight.name}`)
  } else {
    await api("/insights/", { method: "POST", body: JSON.stringify(body) })
    console.log(`+ insight created: ${insight.name}`)
  }
}

async function main() {
  console.log(`Applying ${INSIGHTS.length} insights to ${HOST} project ${PROJECT}…`)
  const dashboardId = await upsertDashboard()
  for (const insight of INSIGHTS) await upsertInsight(dashboardId, insight)
  console.log(`\n✓ Done. Open: ${HOST}/project/${PROJECT}/dashboard/${dashboardId}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
