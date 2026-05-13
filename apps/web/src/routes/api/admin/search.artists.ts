import { createFileRoute } from "@tanstack/react-router"

import { handleError, json, requireAdmin } from "../../../lib/admin"
import { searchArtistsList } from "../../../lib/deezer"

export const Route = createFileRoute("/api/admin/search/artists")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
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
