import { createFileRoute } from "@tanstack/react-router"

import { json } from "../../../lib/admin"
import { logServer } from "../../../lib/log"
import {
  getDailyForBroadcast,
  dailyPayload,
  postMessage,
} from "../../../lib/discord"

/** Current hour (0–23) in Europe/Berlin, DST-correct. */
function berlinHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      hour12: false,
    }).format(new Date())
  )
}

/**
 * Posts the daily bar to #punchline-des-tages at 18:00 Europe/Berlin.
 *
 * Vercel Cron is UTC and DST-blind, so vercel.json fires this at BOTH 16:00 and
 * 17:00 UTC (the two clock-times that map to 18:00 Berlin across summer/winter).
 * The Berlin-hour guard below ensures exactly one of those actually posts.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the
 * CRON_SECRET env var is set. Pass ?force=1 to bypass the time guard for manual
 * testing (still requires the secret in prod).
 */
export const Route = createFileRoute("/api/cron/discord-daily")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET
        if (!secret) {
          logServer("error", "discord_daily_misconfigured", {
            reason: "CRON_SECRET missing",
          })
          return json({ error: "CRON_SECRET missing" }, 500)
        }
        const auth = request.headers.get("authorization")
        if (auth !== `Bearer ${secret}`) {
          return new Response("unauthorized", { status: 401 })
        }

        const force = new URL(request.url).searchParams.get("force") === "1"
        const hour = berlinHour()
        if (!force && hour !== 18) {
          return json({
            skipped: "outside 18:00 Europe/Berlin",
            berlinHour: hour,
          })
        }

        const channelId = process.env.DISCORD_DAILY_CHANNEL_ID
        if (!channelId) {
          logServer("error", "discord_daily_misconfigured", {
            reason: "no channel id",
          })
          return json({ error: "DISCORD_DAILY_CHANNEL_ID missing" }, 500)
        }

        const daily = await getDailyForBroadcast()
        if (!daily) {
          logServer("info", "discord_daily_skipped", {
            reason: "no challenge scheduled",
          })
          return json({ skipped: "no daily scheduled" })
        }

        await postMessage(channelId, dailyPayload(daily))
        logServer("info", "discord_daily_posted", {
          number: daily.number,
          date: daily.date,
        })
        return json({ posted: true, number: daily.number, date: daily.date })
      },
    },
  },
})
