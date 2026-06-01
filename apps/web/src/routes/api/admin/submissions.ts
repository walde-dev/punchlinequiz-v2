import { createFileRoute } from "@tanstack/react-router"
import { desc, eq } from "drizzle-orm"
import { punchlineSubmissions, users } from "@workspace/db"

import { db } from "../../../lib/db"
import { errorJson, handleError, json } from "../../../lib/admin"
import { requireAdmin } from "../../../lib/auth"
import { getTiersFor, type ContributorTier } from "../../../lib/contributor"

/** Higher = reviewed first. Trusted contributors jump the pending queue (PUN-66). */
const TIER_PRIORITY: Record<ContributorTier, number> = { verifiziert: 2, vertraut: 1, neuling: 0 }

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
              submitterClerkId: punchlineSubmissions.submitterClerkId,
              submitterHandle: users.handle,
            })
            .from(punchlineSubmissions)
            .innerJoin(users, eq(users.clerkId, punchlineSubmissions.submitterClerkId))
            .where(eq(punchlineSubmissions.status, status))
            .orderBy(desc(punchlineSubmissions.createdAt))
            .limit(100)

          // Resolve each submitter's tier, then attach + (for the pending queue)
          // reorder: trusted tiers first, oldest-first within a tier so nothing rots.
          const tiers = await getTiersFor([...new Set(rows.map((r) => r.submitterClerkId))])
          let items = rows.map(({ submitterClerkId, ...r }) => ({
            ...r,
            submitterTier: tiers.get(submitterClerkId) ?? ("neuling" as ContributorTier),
          }))
          if (status === "pending") {
            items = items.sort((a, b) => {
              const d = TIER_PRIORITY[b.submitterTier] - TIER_PRIORITY[a.submitterTier]
              if (d !== 0) return d
              return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            })
          }
          return json({ items })
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
