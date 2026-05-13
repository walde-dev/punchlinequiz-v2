import { createFileRoute } from "@tanstack/react-router"
import { json, requireAdmin } from "../../../lib/admin"

export const Route = createFileRoute("/api/admin/ping")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauthorized = requireAdmin(request)
        if (unauthorized) return unauthorized
        return json({ ok: true, time: new Date().toISOString() })
      },
    },
  },
})
