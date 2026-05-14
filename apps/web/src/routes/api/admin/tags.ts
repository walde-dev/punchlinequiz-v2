import { createFileRoute } from "@tanstack/react-router"
import { asc, eq, sql } from "drizzle-orm"
import { artistTags, tags } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  handleError,
  HttpError,
  json,
  readJsonBody,
  requireAdmin,
  requireString,
  slugify,
} from "../../../lib/admin"

export const Route = createFileRoute("/api/admin/tags")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const rows = await db
            .select({
              id: tags.id,
              slug: tags.slug,
              label: tags.label,
              artistCount: sql<number>`count(${artistTags.artistId})::int`,
            })
            .from(tags)
            .leftJoin(artistTags, eq(artistTags.tagId, tags.id))
            .groupBy(tags.id)
            .orderBy(asc(tags.label))
          return json({ items: rows })
        } catch (err) {
          return handleError(err)
        }
      },
      POST: async ({ request }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const body = await readJsonBody<Record<string, unknown>>(request)
          const label = requireString(body.label, "label", { max: 120 })
          const slug = slugify(label).slice(0, 60)
          if (!slug) throw new HttpError(400, "invalid_field", "label must produce a slug.")
          const existing = (
            await db.select().from(tags).where(eq(tags.slug, slug)).limit(1)
          )[0]
          if (existing) {
            return json({ id: existing.id, slug: existing.slug, label: existing.label, created: false })
          }
          const [row] = await db
            .insert(tags)
            .values({ slug, label })
            .returning()
          audit("create_tag", { id: row!.id, slug: row!.slug })
          return json({ id: row!.id, slug: row!.slug, label: row!.label, created: true }, 201)
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
