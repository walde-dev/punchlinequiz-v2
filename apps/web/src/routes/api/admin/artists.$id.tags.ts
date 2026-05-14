import { createFileRoute } from "@tanstack/react-router"
import { asc, desc, eq, inArray } from "drizzle-orm"
import { artistTags, artists, tags } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  handleError,
  HttpError,
  json,
  readJsonBody,
  requireAdmin,
} from "../../../lib/admin"

export const Route = createFileRoute("/api/admin/artists/$id/tags")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const id = Number(params.id)
          if (!Number.isInteger(id) || id <= 0)
            throw new HttpError(400, "invalid_id", "Id must be a positive integer.")
          const rows = await db
            .select({
              tagId: tags.id,
              slug: tags.slug,
              label: tags.label,
              weight: artistTags.weight,
            })
            .from(artistTags)
            .innerJoin(tags, eq(tags.id, artistTags.tagId))
            .where(eq(artistTags.artistId, id))
            .orderBy(desc(artistTags.weight), asc(tags.label))
          return json({ items: rows })
        } catch (err) {
          return handleError(err)
        }
      },
      PUT: async ({ request, params }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const id = Number(params.id)
          if (!Number.isInteger(id) || id <= 0)
            throw new HttpError(400, "invalid_id", "Id must be a positive integer.")
          const existing = (await db.select().from(artists).where(eq(artists.id, id)).limit(1))[0]
          if (!existing) throw new HttpError(404, "not_found", "Artist not found.")

          const body = await readJsonBody<{ tags?: Array<{ slug?: string; tagId?: number; weight?: number }> }>(
            request,
          )
          const incoming = Array.isArray(body.tags) ? body.tags : []

          // Normalize + validate
          const wantSlugs = new Set<string>()
          const wantIds = new Set<number>()
          const weightBySlug = new Map<string, number>()
          const weightById = new Map<number, number>()
          for (const t of incoming) {
            const w = typeof t.weight === "number" ? t.weight : 1
            if (!Number.isFinite(w) || w < 0 || w > 1) {
              throw new HttpError(400, "invalid_field", "weight must be a number in [0, 1].")
            }
            if (t.slug) {
              wantSlugs.add(t.slug)
              weightBySlug.set(t.slug, w)
            } else if (typeof t.tagId === "number" && Number.isInteger(t.tagId)) {
              wantIds.add(t.tagId)
              weightById.set(t.tagId, w)
            }
          }

          const resolved: { id: number; weight: number }[] = []
          if (wantSlugs.size > 0) {
            const rows = await db
              .select({ id: tags.id, slug: tags.slug })
              .from(tags)
              .where(inArray(tags.slug, Array.from(wantSlugs)))
            for (const r of rows) {
              const w = weightBySlug.get(r.slug)
              if (w !== undefined) resolved.push({ id: r.id, weight: w })
            }
            if (rows.length !== wantSlugs.size) {
              const known = new Set(rows.map((r) => r.slug))
              const missing = Array.from(wantSlugs).filter((s) => !known.has(s))
              throw new HttpError(400, "unknown_tag", `Unknown tag slugs: ${missing.join(", ")}`)
            }
          }
          if (wantIds.size > 0) {
            const rows = await db
              .select({ id: tags.id })
              .from(tags)
              .where(inArray(tags.id, Array.from(wantIds)))
            const found = new Set(rows.map((r) => r.id))
            for (const tid of wantIds) {
              if (!found.has(tid)) throw new HttpError(400, "unknown_tag", `Unknown tag id: ${tid}`)
              resolved.push({ id: tid, weight: weightById.get(tid)! })
            }
          }

          // Replace all
          await db.delete(artistTags).where(eq(artistTags.artistId, id))
          if (resolved.length > 0) {
            await db
              .insert(artistTags)
              .values(resolved.map((r) => ({ artistId: id, tagId: r.id, weight: r.weight })))
          }
          audit("set_artist_tags", { id, count: resolved.length })

          const items = await db
            .select({
              tagId: tags.id,
              slug: tags.slug,
              label: tags.label,
              weight: artistTags.weight,
            })
            .from(artistTags)
            .innerJoin(tags, eq(tags.id, artistTags.tagId))
            .where(eq(artistTags.artistId, id))
            .orderBy(desc(artistTags.weight), asc(tags.label))
          return json({ items })
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
