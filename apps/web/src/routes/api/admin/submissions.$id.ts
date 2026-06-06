import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { punchlineSubmissions, punchlines } from "@workspace/db"

import { db } from "../../../lib/db"
import {
  audit,
  errorJson,
  handleError,
  json,
  optionalString,
  optionalStringArray,
  readJsonBody,
  requireString,
} from "../../../lib/admin"
import { requireAdmin } from "../../../lib/auth"
import { grantContributorXp } from "../../../lib/contributor"
import { upsertBar } from "../../../lib/upsert"

/**
 * Admin: approve (mint a real, reviewed punchline) or reject a submission.
 * Approve reuses upsertBar (auto-creates artist/song + Deezer artwork) then
 * flips the minted row to reviewed=true (+ optional cloze), and records the
 * created punchline on the submission.
 */
export const Route = createFileRoute("/api/admin/submissions/$id")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireAdmin(request)
          const id = Number(params.id)
          if (!Number.isInteger(id) || id <= 0) {
            return errorJson("bad_request", "Invalid submission id.", 400)
          }

          const [submission] = await db
            .select()
            .from(punchlineSubmissions)
            .where(eq(punchlineSubmissions.id, id))
            .limit(1)
          if (!submission)
            return errorJson("not_found", "Submission not found.", 404)
          if (submission.status !== "pending") {
            return errorJson(
              "already_resolved",
              "Submission already resolved.",
              409
            )
          }

          const body = await readJsonBody<Record<string, unknown>>(request)
          const action = requireString(body.action, "action")

          if (action === "reject") {
            await db
              .update(punchlineSubmissions)
              .set({
                status: "rejected",
                rejectionReason:
                  optionalString(body.reason, "reason", { max: 500 }) ?? null,
              })
              .where(eq(punchlineSubmissions.id, id))
            audit(
              "review_submission",
              { submissionId: id, action: "reject" },
              actor
            )
            return json({ ok: true, action: "reject" })
          }

          if (action !== "approve") {
            return errorJson("bad_request", "Unknown action.", 400)
          }

          // Mint via upsertBar (names → resolve/create artist+song+distractors).
          const minted = await upsertBar({
            artist: requireString(body.artist, "artist", { max: 200 }),
            song: requireString(body.song, "song", { max: 300 }),
            line: requireString(body.line, "line", { max: 1000 }),
            distractor1: requireString(body.distractor1, "distractor1", {
              max: 200,
            }),
            distractor2: requireString(body.distractor2, "distractor2", {
              max: 200,
            }),
            perfectSolution: optionalStringArray(
              body.perfectSolution,
              "perfectSolution"
            ),
          })

          // Flip to reviewed (admin completion IS the review) + optional cloze,
          // and credit the contributor on the bar itself (PUN-67 attribution).
          const clozePrompt = optionalString(body.clozePrompt, "clozePrompt", {
            max: 1000,
          })
          await db
            .update(punchlines)
            .set({
              reviewed: true,
              submittedByClerkId: submission.submitterClerkId,
              ...(clozePrompt ? { clozePrompt, clozeEnabled: true } : {}),
            })
            .where(eq(punchlines.id, minted.punchlineId))

          await db
            .update(punchlineSubmissions)
            .set({ status: "approved", createdPunchlineId: minted.punchlineId })
            .where(eq(punchlineSubmissions.id, id))

          // Grant contributor XP (idempotent; after the status flip so counts
          // include this acceptance). Feeds total_xp / rank / all-time board.
          const grant = await grantContributorXp({
            submissionId: id,
            clerkId: submission.submitterClerkId,
          })

          audit(
            "review_submission",
            {
              submissionId: id,
              action: "approve",
              createdPunchlineId: minted.punchlineId,
              xpGranted: grant.awarded ? grant.xp : 0,
              tierUp: grant.awarded ? grant.tierUp : false,
              newTier: grant.awarded ? grant.newTier : null,
            },
            actor
          )
          return json({
            ok: true,
            action: "approve",
            punchlineId: minted.punchlineId,
            xpGranted: grant.awarded ? grant.xp : 0,
            tierUp: grant.awarded ? grant.tierUp : false,
          })
        } catch (err) {
          return handleError(err)
        }
      },
    },
  },
})

export const _allow = ["POST"] as const
export function _methodNotAllowed() {
  return errorJson("method_not_allowed", "Method not allowed.", 405)
}
