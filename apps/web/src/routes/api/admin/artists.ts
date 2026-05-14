import { createFileRoute } from "@tanstack/react-router"
import { and, asc, eq, ilike, inArray, or } from "drizzle-orm"
import { artistTags, artists, tags } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  handleError,
  HttpError,
  json,
  readJsonBody,
  requireAdmin,
  requireString,
} from "../../../lib/admin"
import { resolveOrCreateArtist } from "../../../lib/upsert"

export const Route = createFileRoute("/api/admin/artists")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const url = new URL(request.url)
          const q = url.searchParams.get("q")?.trim()
          const includeInactive = url.searchParams.get("includeInactive") === "true"

          const conds = []
          if (!includeInactive) conds.push(eq(artists.active, true))
          if (q) conds.push(or(ilike(artists.name, `%${q}%`), ilike(artists.slug, `%${q}%`))!)

          const rows = await db
            .select({
              id: artists.id,
              name: artists.name,
              slug: artists.slug,
              imageUrl: artists.imageUrl,
              active: artists.active,
            })
            .from(artists)
            .where(conds.length ? and(...conds) : undefined)
            .orderBy(asc(artists.name))
            .limit(500)

          // Join tags in a second query so the row shape stays flat. Empty
          // tag arrays are fine — used by the admin UI to sort distractor
          // options by scene-overlap with the correct artist.
          const tagRows = await db
            .select({ artistId: artistTags.artistId, slug: tags.slug })
            .from(artistTags)
            .innerJoin(tags, eq(tags.id, artistTags.tagId))
          const tagsByArtist = new Map<number, string[]>()
          for (const t of tagRows) {
            const list = tagsByArtist.get(t.artistId) ?? []
            list.push(t.slug)
            tagsByArtist.set(t.artistId, list)
          }
          const items = rows.map((r) => ({
            ...r,
            tags: tagsByArtist.get(r.id) ?? [],
          }))

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
          const name = requireString(body.name, "name", { max: 200 })
          const { row, created } = await resolveOrCreateArtist(name)

          // Optional: attach tags on create. `tags` is an array of {slug, weight}.
          let tagCount = 0
          if (Array.isArray(body.tags) && body.tags.length > 0) {
            const wantSlugs: string[] = []
            const weightBySlug = new Map<string, number>()
            for (const t of body.tags as Array<{ slug?: string; weight?: number }>) {
              if (!t.slug) continue
              const w = typeof t.weight === "number" ? t.weight : 1
              if (!Number.isFinite(w) || w < 0 || w > 1) {
                throw new HttpError(400, "invalid_field", "weight must be a number in [0, 1].")
              }
              wantSlugs.push(t.slug)
              weightBySlug.set(t.slug, w)
            }
            if (wantSlugs.length > 0) {
              const rows = await db
                .select({ id: tags.id, slug: tags.slug })
                .from(tags)
                .where(inArray(tags.slug, wantSlugs))
              const known = new Set(rows.map((r) => r.slug))
              const missing = wantSlugs.filter((s) => !known.has(s))
              if (missing.length > 0) {
                throw new HttpError(400, "unknown_tag", `Unknown tag slugs: ${missing.join(", ")}`)
              }
              if (rows.length > 0) {
                await db
                  .insert(artistTags)
                  .values(
                    rows.map((r) => ({
                      artistId: row.id,
                      tagId: r.id,
                      weight: weightBySlug.get(r.slug)!,
                    })),
                  )
                  .onConflictDoNothing()
                tagCount = rows.length
              }
            }
          }

          audit(created ? "add_artist" : "lookup_artist", {
            id: row.id,
            name: row.name,
            tags: tagCount,
          })
          return json(
            {
              id: row.id,
              name: row.name,
              slug: row.slug,
              imageUrl: row.imageUrl,
              active: row.active,
              created,
              tagCount,
            },
            created ? 201 : 200,
          )
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
