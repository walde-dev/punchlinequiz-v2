import { createFileRoute } from "@tanstack/react-router"

import { json } from "../../../lib/admin"
import { postMessage } from "../../../lib/discord-rest"
import { logServer } from "../../../lib/log"
import { computeRetention, formatRetentionMessage } from "../../../lib/retention"

/**
 * Daily retention watch (PUN-120). Computes D1/D7 retention for recent anon
 * cohorts over game_events and posts it to the staff Discord channel, so the
 * launch cohort's return rate is visible without anyone running a query.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`. ?force=1 runs ad-hoc.
 * Scheduled daily at 07:00 UTC (see vercel.json).
 */
export const Route = createFileRoute("/api/cron/retention-report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET
        if (secret) {
          const auth = request.headers.get("authorization")
          if (auth !== `Bearer ${secret}`) {
            return new Response("unauthorized", { status: 401 })
          }
        }

        const rows = await computeRetention(14)

        const channelId = process.env.DISCORD_ALERTS_CHANNEL_ID
        if (channelId && process.env.DISCORD_BOT_TOKEN) {
          await postMessage(channelId, { content: formatRetentionMessage(rows) })
        } else {
          logServer("warn", "retention_report_no_channel", {
            reason: "DISCORD_ALERTS_CHANNEL_ID / DISCORD_BOT_TOKEN unset",
          })
        }

        logServer("info", "retention_report_posted", { cohorts: rows.length })
        return json({ posted: !!channelId, cohorts: rows })
      },
    },
  },
})
