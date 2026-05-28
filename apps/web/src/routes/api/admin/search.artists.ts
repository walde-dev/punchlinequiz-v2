import { createFileRoute } from "@tanstack/react-router"

import { handleError, json } from "../../../lib/admin"
import { requireAdmin } from "../../../lib/auth"
import { searchArtistsList } from "../../../lib/deezer"

export const Route = createFileRoute("/api/admin/search/artists")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request)
          const url = new URL(request.url)
          const q = url.searchParams.get("q")?.trim() ?? ""
          if (!q) return json({ items: [] })
          const items = await searchArtistsList(q, 8)
          return json({ items })
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
