import { createFileRoute } from "@tanstack/react-router"
import { desc, eq } from "drizzle-orm"
import { punchlineSubmissions, users } from "@workspace/db"

import { db } from "../../../lib/db"
import { errorJson, handleError, json } from "../../../lib/admin"
import { requireAdmin } from "../../../lib/auth"

/** Admin: list submissions (default pending) for the review queue. */
export const Route = createFileRoute("/api/admin/submissions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request)
          const url = new URL(request.url)
          const status = url.searchParams.get("status") ?? "pending"
          const rows = await db
            .select({
              id: punchlineSubmissions.id,
              line: punchlineSubmissions.line,
              clozePrompt: punchlineSubmissions.clozePrompt,
              perfectSolution: punchlineSubmissions.perfectSolution,
              artistHint: punchlineSubmissions.artistHint,
              songHint: punchlineSubmissions.songHint,
              note: punchlineSubmissions.note,
              status: punchlineSubmissions.status,
              createdAt: punchlineSubmissions.createdAt,
              submitterHandle: users.handle,
            })
            .from(punchlineSubmissions)
            .innerJoin(users, eq(users.clerkId, punchlineSubmissions.submitterClerkId))
            .where(eq(punchlineSubmissions.status, status))
            .orderBy(desc(punchlineSubmissions.createdAt))
            .limit(100)
          return json({ items: rows })
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})

export const _allow = ["GET"] as const
export function _methodNotAllowed() {
  return errorJson("method_not_allowed", "Method not allowed.", 405)
}
