import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { xpConfig } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  errorJson,
  handleError,
  HttpError,
  json,
  readJsonBody,
} from "../../../lib/admin"
import { requireAdmin } from "../../../lib/auth"
import { invalidateXpCaches } from "../../../lib/xp"

const NUMERIC_FIELDS = [
  "xpArtistCorrect",
  "xpClozeCorrect",
  "xpSongBonus",
  "xpDailyArtist",
  "xpDailySong",
  "xpDailyPerfectBonus",
  "streakBonusPerStep",
  "streakMaxBonus",
  "streakIdleResetMinutes",
  "minSecondsBetweenAttempts",
  "xpSubmissionAccepted",
  "xpReferralReferrer",
  "xpReferralReferee",
  "referralDailyCap",
] as const

type ConfigField = (typeof NUMERIC_FIELDS)[number]

function pickNumber(body: Record<string, unknown>, key: ConfigField): number | null {
  const v = body[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1_000_000) {
    throw new HttpError(400, "invalid_field", `${key} must be a non-negative integer ≤ 1,000,000.`)
  }
  return Math.floor(v)
}

export const Route = createFileRoute("/api/admin/xp-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request)
          const [row] = await db.select().from(xpConfig).where(eq(xpConfig.id, 1)).limit(1)
          if (!row) throw new HttpError(500, "missing_config", "xp_config row missing.")
          return json(row)
        } catch (err) {
          return handleError(err)
        }
      },
      PUT: async ({ request }) => {
        try {
          const actor = await requireAdmin(request)
          const body = await readJsonBody<Record<string, unknown>>(request)
          const update: Partial<Record<ConfigField, number>> = {}
          for (const f of NUMERIC_FIELDS) {
            const v = pickNumber(body, f)
            if (v !== null) update[f] = v
          }
          if (Object.keys(update).length === 0) {
            throw new HttpError(400, "no_fields", "Provide at least one field to update.")
          }
          const [updated] = await db
            .update(xpConfig)
            .set({ ...update, updatedAt: new Date() })
            .where(eq(xpConfig.id, 1))
            .returning()
          invalidateXpCaches()
          audit("xp_config_update", { changed: Object.keys(update) }, actor)
          return json(updated)
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})

export const _allow = ["GET", "PUT"] as const
export function _methodNotAllowed() {
  return errorJson("method_not_allowed", "Method not allowed.", 405)
}
