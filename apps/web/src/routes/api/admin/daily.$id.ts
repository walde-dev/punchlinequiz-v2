import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { dailyChallenges } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  HttpError,
  audit,
  errorJson,
  handleError,
  json,
} from "../../../lib/admin"
import { requireAdmin } from "../../../lib/auth"

function parseId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, "invalid_id", "Id must be a positive integer.")
  }
  return id
}

export const Route = createFileRoute("/api/admin/daily/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const actor = await requireAdmin(request)
          const id = parseId(params.id)
          const existing = await db
            .select({ id: dailyChallenges.id, date: dailyChallenges.date })
            .from(dailyChallenges)
            .where(eq(dailyChallenges.id, id))
            .limit(1)
          if (existing.length === 0) {
            throw new HttpError(404, "not_found", "Daily entry not found.")
          }
          await db.delete(dailyChallenges).where(eq(dailyChallenges.id, id))
          audit("unschedule_daily", { id, date: existing[0].date }, actor)
          return json({ deleted: true })
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})

export const _allow = ["DELETE"] as const
export function _methodNotAllowed() {
  return errorJson("method_not_allowed", "Method not allowed.", 405)
}
