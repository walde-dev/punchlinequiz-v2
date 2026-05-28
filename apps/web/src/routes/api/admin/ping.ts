import { createFileRoute } from "@tanstack/react-router"
import { handleError, json } from "../../../lib/admin"
import { requireAdmin } from "../../../lib/auth"

export const Route = createFileRoute("/api/admin/ping")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request)
          return json({ ok: true, time: new Date().toISOString() })
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})
