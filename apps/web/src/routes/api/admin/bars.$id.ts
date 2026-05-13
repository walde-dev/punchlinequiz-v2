import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { artists, punchlines, songs } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  handleError,
  HttpError,
  json,
  optionalString,
  optionalStringArray,
  readJsonBody,
  requireAdmin,
} from "../../../lib/admin"

async function loadBar(id: number) {
  const rows = await db
    .select({
      id: punchlines.id,
      line: punchlines.line,
      active: punchlines.active,
      perfectSolution: punchlines.perfectSolution,
      acceptableSolutions: punchlines.acceptableSolutions,
      createdAt: punchlines.createdAt,
      songId: songs.id,
      songTitle: songs.title,
      songAlbum: songs.album,
      releaseYear: songs.releaseYear,
      artistId: artists.id,
      artistName: artists.name,
      artistSlug: artists.slug,
    })
    .from(punchlines)
    .innerJoin(songs, eq(songs.id, punchlines.songId))
    .innerJoin(artists, eq(artists.id, songs.artistId))
    .where(eq(punchlines.id, id))
    .limit(1)
  return rows[0] ?? null
}

function parseId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, "invalid_id", "Id must be a positive integer.")
  }
  return id
}

export const Route = createFileRoute("/api/admin/bars/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const id = parseId(params.id)
          const bar = await loadBar(id)
          if (!bar) throw new HttpError(404, "not_found", "Bar not found.")
          return json(bar)
        } catch (err) {
          return handleError(err)
        }
      },
      PATCH: async ({ request, params }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const id = parseId(params.id)
          const bar = await loadBar(id)
          if (!bar) throw new HttpError(404, "not_found", "Bar not found.")

          const body = await readJsonBody<Record<string, unknown>>(request)
          const patch: Record<string, unknown> = {}
          const line = optionalString(body.line, "line", { max: 1000 })
          if (line !== undefined) patch.line = line
          if (body.active !== undefined) {
            if (typeof body.active !== "boolean")
              throw new HttpError(400, "invalid_field", "active must be boolean.")
            patch.active = body.active
          }
          const perfect = optionalStringArray(body.perfectSolution, "perfectSolution")
          if (perfect !== undefined) patch.perfectSolution = perfect
          if (Array.isArray(body.acceptableSolutions)) {
            patch.acceptableSolutions = (body.acceptableSolutions as unknown[]).map(
              (arr, i) => optionalStringArray(arr, `acceptableSolutions[${i}]`) ?? [],
            )
          }
          if (Object.keys(patch).length === 0)
            throw new HttpError(400, "empty_patch", "Provide at least one field to update.")

          const [updated] = await db
            .update(punchlines)
            .set(patch)
            .where(eq(punchlines.id, id))
            .returning()
          audit("edit_bar", { id, fields: Object.keys(patch) })
          return json(updated)
        } catch (err) {
          return handleError(err)
        }
      },
      DELETE: async ({ request, params }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const id = parseId(params.id)
          const url = new URL(request.url)
          const hard = url.searchParams.get("hard") === "true"
          const bar = await loadBar(id)
          if (!bar) throw new HttpError(404, "not_found", "Bar not found.")

          if (hard) {
            await db.delete(punchlines).where(eq(punchlines.id, id))
            audit("delete_bar", { id, hard: true })
            return json({ deleted: true, hard: true })
          }
          await db.update(punchlines).set({ active: false }).where(eq(punchlines.id, id))
          audit("delete_bar", { id, hard: false })
          return json({ deleted: true, hard: false })
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
