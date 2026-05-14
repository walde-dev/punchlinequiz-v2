import { createFileRoute } from "@tanstack/react-router"
import { and, desc, eq, ilike, sql } from "drizzle-orm"
import { artists, punchlines, songs } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  errorJson,
  handleError,
  json,
  optionalInt,
  optionalString,
  optionalStringArray,
  readJsonBody,
  requireAdmin,
  requireString,
} from "../../../lib/admin"
import { upsertBar } from "../../../lib/upsert"

export const Route = createFileRoute("/api/admin/bars")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const body = await readJsonBody<Record<string, unknown>>(request)
          const input = {
            artist: requireString(body.artist, "artist", { max: 200 }),
            song: requireString(body.song, "song", { max: 300 }),
            line: requireString(body.line, "line", { max: 1000 }),
            distractor1: requireString(body.distractor1, "distractor1", { max: 200 }),
            distractor2: requireString(body.distractor2, "distractor2", { max: 200 }),
            album: optionalString(body.album, "album", { max: 300 }),
            releaseYear: optionalInt(body.releaseYear, "releaseYear", { min: 1980, max: 2100 }),
            perfectSolution: optionalStringArray(body.perfectSolution, "perfectSolution"),
            acceptableSolutions: Array.isArray(body.acceptableSolutions)
              ? (body.acceptableSolutions as unknown[]).map(
                  (arr, i) => optionalStringArray(arr, `acceptableSolutions[${i}]`) ?? [],
                )
              : undefined,
          }
          const result = await upsertBar(input)
          audit("add_bar", {
            punchlineId: result.punchlineId,
            songId: result.songId,
            artistId: result.artistId,
            distractor1Id: result.distractor1Id,
            distractor2Id: result.distractor2Id,
            created: result.created,
          })
          return json(result, 201)
        } catch (err) {
          return handleError(err)
        }
      },
      GET: async ({ request }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const url = new URL(request.url)
          const artistQ = url.searchParams.get("artist")
          const songQ = url.searchParams.get("song")
          const searchQ = url.searchParams.get("search")
          const limit = Math.min(
            Number(url.searchParams.get("limit") ?? "50") || 50,
            200,
          )
          const offset = Math.max(Number(url.searchParams.get("offset") ?? "0") || 0, 0)
          const includeInactive = url.searchParams.get("includeInactive") === "true"
          const reviewedParam = url.searchParams.get("reviewed")
          const excludeIdsParam = url.searchParams.get("excludeIds")
          const random = url.searchParams.get("random") === "true"

          const conds = []
          if (!includeInactive) conds.push(eq(punchlines.active, true))
          if (artistQ) conds.push(ilike(artists.name, `%${artistQ}%`))
          if (songQ) conds.push(ilike(songs.title, `%${songQ}%`))
          if (searchQ) conds.push(ilike(punchlines.line, `%${searchQ}%`))
          if (reviewedParam === "true") conds.push(eq(punchlines.reviewed, true))
          if (reviewedParam === "false") conds.push(eq(punchlines.reviewed, false))
          if (excludeIdsParam) {
            const ids = excludeIdsParam
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isInteger(n) && n > 0)
            if (ids.length > 0) {
              conds.push(sql`${punchlines.id} not in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
            }
          }

          const rows = await db
            .select({
              id: punchlines.id,
              line: punchlines.line,
              clozePrompt: punchlines.clozePrompt,
              clozeEnabled: punchlines.clozeEnabled,
              perfectSolution: punchlines.perfectSolution,
              reviewed: punchlines.reviewed,
              active: punchlines.active,
              createdAt: punchlines.createdAt,
              songId: songs.id,
              songTitle: songs.title,
              songAlbum: songs.album,
              releaseYear: songs.releaseYear,
              artistId: artists.id,
              artistName: artists.name,
              artistSlug: artists.slug,
              distractor1Id: punchlines.distractor1Id,
              distractor2Id: punchlines.distractor2Id,
            })
            .from(punchlines)
            .innerJoin(songs, eq(songs.id, punchlines.songId))
            .innerJoin(artists, eq(artists.id, songs.artistId))
            .where(conds.length ? and(...conds) : undefined)
            .orderBy(random ? sql`random()` : desc(punchlines.createdAt))
            .limit(limit)
            .offset(offset)

          const [{ total }] = await db
            .select({ total: sql<number>`count(*)::int` })
            .from(punchlines)
            .innerJoin(songs, eq(songs.id, punchlines.songId))
            .innerJoin(artists, eq(artists.id, songs.artistId))
            .where(conds.length ? and(...conds) : undefined)

          return json({ items: rows, total, limit, offset })
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})

// Catch-all for unknown methods on this path.
export const _allow = ["POST", "GET"] as const
export function _methodNotAllowed() {
  return errorJson("method_not_allowed", "Method not allowed.", 405)
}
