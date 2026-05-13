import { createFileRoute } from "@tanstack/react-router"
import { and, asc, eq, ilike, or } from "drizzle-orm"
import { artists } from "@workspace/db"

import { db } from "../../../lib/db"
import { handleError, json, requireAdmin } from "../../../lib/admin"

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

          return json({ items: rows })
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
