import { createFileRoute } from "@tanstack/react-router"

import { errorJson, handleError, json, requireAdmin } from "../../../lib/admin"
import { getTrackById } from "../../../lib/deezer"

export const Route = createFileRoute("/api/admin/search/track/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        try {
          const id = params.id?.trim()
          if (!id) return errorJson("invalid_id", "Missing track id.", 400)
          const match = await getTrackById(id)
          if (!match) return errorJson("not_found", "Track not found on Deezer.", 404)
          return json(match)
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
