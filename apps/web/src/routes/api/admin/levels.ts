import { createFileRoute } from "@tanstack/react-router"
import { asc } from "drizzle-orm"
import { levels } from "@workspace/db"

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

type LevelInput = {
  threshold: unknown
  nameDe: unknown
  nameEn: unknown
  accent?: unknown
}

function validateLevels(input: unknown): Array<{ threshold: number; nameDe: string; nameEn: string; accent: string }> {
  if (!Array.isArray(input)) {
    throw new HttpError(400, "invalid_payload", "Body must be { levels: [...] } array.")
  }
  if (input.length === 0) {
    throw new HttpError(400, "empty_levels", "At least one level is required.")
  }
  if (input.length > 50) {
    throw new HttpError(400, "too_many", "Max 50 levels.")
  }
  const out = input.map((raw, i): { threshold: number; nameDe: string; nameEn: string; accent: string } => {
    const r = raw as LevelInput
    if (typeof r.threshold !== "number" || !Number.isInteger(r.threshold) || r.threshold < 0) {
      throw new HttpError(400, "invalid_field", `levels[${i}].threshold must be a non-negative integer.`)
    }
    if (typeof r.nameDe !== "string" || !r.nameDe.trim()) {
      throw new HttpError(400, "invalid_field", `levels[${i}].nameDe is required.`)
    }
    if (typeof r.nameEn !== "string" || !r.nameEn.trim()) {
      throw new HttpError(400, "invalid_field", `levels[${i}].nameEn is required.`)
    }
    const accent = typeof r.accent === "string" && r.accent.trim() ? r.accent.trim() : "primary"
    return {
      threshold: r.threshold,
      nameDe: r.nameDe.trim().slice(0, 80),
      nameEn: r.nameEn.trim().slice(0, 80),
      accent: accent.slice(0, 24),
    }
  })
  const sorted = [...out].sort((a, b) => a.threshold - b.threshold)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].threshold === sorted[i - 1].threshold) {
      throw new HttpError(400, "duplicate_threshold", `Threshold ${sorted[i].threshold} appears twice.`)
    }
  }
  if (sorted[0].threshold !== 0) {
    throw new HttpError(400, "missing_zero", "First level must have threshold 0.")
  }
  return sorted
}

export const Route = createFileRoute("/api/admin/levels")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request)
          const rows = await db.select().from(levels).orderBy(asc(levels.threshold))
          return json({ items: rows })
        } catch (err) {
          return handleError(err)
        }
      },
      PUT: async ({ request }) => {
        try {
          const actor = await requireAdmin(request)
          const body = await readJsonBody<{ levels: unknown }>(request)
          const validated = validateLevels(body.levels)

          // Atomic replace: delete all + insert. neon-http batches the
          // statements in a single roundtrip via the same connection.
          await db.delete(levels)
          await db.insert(levels).values(validated)
          invalidateXpCaches()
          audit("levels_replace", { count: validated.length }, actor)
          const rows = await db.select().from(levels).orderBy(asc(levels.threshold))
          return json({ items: rows })
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
