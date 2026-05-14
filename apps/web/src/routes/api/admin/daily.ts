import { createFileRoute } from "@tanstack/react-router"
import { asc, eq, gte } from "drizzle-orm"
import { artists, dailyChallenges, punchlines, songs } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  errorJson,
  handleError,
  HttpError,
  json,
  readJsonBody,
  requireAdmin,
  requireString,
} from "../../../lib/admin"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * List scheduled daily challenges with their bar/song/artist info. By default
 * returns everything from today (CET) onwards; pass `?all=true` to include
 * past dates too (for the admin history view).
 */
async function listDailies(includePast: boolean) {
  // sv-SE locale produces YYYY-MM-DD.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const rows = await db
    .select({
      id: dailyChallenges.id,
      date: dailyChallenges.date,
      createdAt: dailyChallenges.createdAt,
      punchlineId: punchlines.id,
      line: punchlines.line,
      songId: songs.id,
      songTitle: songs.title,
      releaseYear: songs.releaseYear,
      artistId: artists.id,
      artistName: artists.name,
      artistSlug: artists.slug,
    })
    .from(dailyChallenges)
    .innerJoin(punchlines, eq(punchlines.id, dailyChallenges.punchlineId))
    .innerJoin(songs, eq(songs.id, punchlines.songId))
    .innerJoin(artists, eq(artists.id, songs.artistId))
    .where(includePast ? undefined : gte(dailyChallenges.date, today))
    .orderBy(asc(dailyChallenges.date))
  return rows
}

export const Route = createFileRoute("/api/admin/daily")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const url = new URL(request.url)
          const all = url.searchParams.get("all") === "true"
          const items = await listDailies(all)
          return json({ items })
        } catch (err) {
          return handleError(err)
        }
      },
      POST: async ({ request }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const body = await readJsonBody<Record<string, unknown>>(request)
          const date = requireString(body.date, "date", { max: 10, min: 10 })
          if (!ISO_DATE.test(date)) {
            throw new HttpError(400, "invalid_field", "date must be YYYY-MM-DD.")
          }
          if (typeof body.punchlineId !== "number" || !Number.isInteger(body.punchlineId)) {
            throw new HttpError(400, "invalid_field", "punchlineId must be an integer.")
          }
          const punchlineId = body.punchlineId as number

          const existsBar = await db
            .select({ id: punchlines.id })
            .from(punchlines)
            .where(eq(punchlines.id, punchlineId))
            .limit(1)
          if (existsBar.length === 0) {
            throw new HttpError(404, "not_found", "Punchline not found.")
          }

          const dupDate = await db
            .select({ id: dailyChallenges.id })
            .from(dailyChallenges)
            .where(eq(dailyChallenges.date, date))
            .limit(1)
          if (dupDate.length > 0) {
            throw new HttpError(409, "date_taken", "Another bar is already scheduled for that date.")
          }

          const dupBar = await db
            .select({ id: dailyChallenges.id, date: dailyChallenges.date })
            .from(dailyChallenges)
            .where(eq(dailyChallenges.punchlineId, punchlineId))
            .limit(1)
          if (dupBar.length > 0) {
            throw new HttpError(
              409,
              "bar_already_scheduled",
              `Bar already scheduled for ${dupBar[0].date}.`,
            )
          }

          const [inserted] = await db
            .insert(dailyChallenges)
            .values({ date, punchlineId })
            .returning()
          audit("schedule_daily", { id: inserted.id, date, punchlineId })
          return json(inserted, 201)
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})

export const _allow = ["GET", "POST"] as const
export function _methodNotAllowed() {
  return errorJson("method_not_allowed", "Method not allowed.", 405)
}
