import { createFileRoute } from "@tanstack/react-router"

import { json } from "../../../lib/admin"
import { logServer } from "../../../lib/log"
import { postMessage } from "../../../lib/discord-rest"

const RED = 0xef4444 // error
const ORANGE = 0xf59e0b // warning
const GOLD = 0xfbbf24 // info / fallback

/**
 * Sentry → Discord #alerts bridge. Sentry posts an issue-alert webhook here; we
 * format it and have OUR bot post to #alerts (so it works despite the channel
 * being locked — no Sentry-bot permissions needed).
 *
 * Setup in Sentry (no code): Project → Alerts → create/edit an Issue Alert →
 * Action "Send a notification via a webhook" (or Settings → Developer Settings →
 * Internal Integration → Webhook URL), pointed at:
 *   https://www.punchlinequiz.de/api/sentry/discord?key=<SENTRY_WEBHOOK_SECRET>
 *
 * The `?key=` shared secret gates it (Sentry's legacy webhooks are unsigned).
 * Handles both the legacy webhook shape and the internal-integration
 * `{ data: { event } }` shape defensively.
 */
export const Route = createFileRoute("/api/sentry/discord")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SENTRY_WEBHOOK_SECRET
        if (secret) {
          const key = new URL(request.url).searchParams.get("key")
          if (key !== secret)
            return new Response("unauthorized", { status: 401 })
        }

        const channelId = process.env.DISCORD_ALERTS_CHANNEL_ID
        if (!channelId) {
          logServer("warn", "sentry_alert_no_channel", {})
          return json({ skipped: "DISCORD_ALERTS_CHANNEL_ID unset" })
        }

        let body: any = {}
        try {
          body = await request.json()
        } catch {
          return new Response("bad request", { status: 400 })
        }

        // Normalize across Sentry payload shapes: legacy webhook (top-level
        // fields + `event`), alert-rule action (`data.event`), and internal-
        // integration resource webhooks (`data.issue` / `data.error`).
        const d = body.data ?? {}
        const event = body.event ?? d.event ?? d.issue ?? d.error ?? {}
        const title: string =
          event.title ||
          body.message ||
          event.culprit ||
          body.culprit ||
          event.metadata?.value ||
          "Sentry alert"
        const level: string = (
          event.level ||
          body.level ||
          "error"
        ).toLowerCase()
        const url: string | undefined =
          body.url ||
          event.web_url ||
          event.permalink ||
          event.issue_url ||
          event.url
        const environment: string | undefined =
          event.environment || body.environment
        // project can be a string (legacy) or an object {name, slug} (internal).
        const projectRaw = body.project_name || body.project || event.project
        const project: string | undefined =
          typeof projectRaw === "string"
            ? projectRaw
            : projectRaw?.slug || projectRaw?.name
        const culprit: string | undefined = body.culprit || event.culprit

        const color =
          level === "warning" ? ORANGE : level === "info" ? GOLD : RED
        const meta = [
          project && `Project: ${project}`,
          environment && `Env: ${environment}`,
          `Level: ${level}`,
        ]
          .filter(Boolean)
          .join(" · ")

        const desc =
          (culprit ? `\`${culprit}\`\n\n` : "") +
          meta +
          (url ? `\n\n[In Sentry öffnen](${url})` : "")

        try {
          await postMessage(channelId, {
            embeds: [
              {
                title: title.slice(0, 250),
                description: desc.slice(0, 1800),
                color,
                url,
              },
            ],
          })
          logServer("info", "sentry_alert_forwarded", {
            level,
            project,
            environment,
          })
        } catch (err) {
          // Don't logServer("error") here — that path also posts to Discord and
          // a failing Discord post would loop. Console only.
          console.error("[sentry→discord] post failed:", err)
          return json({ ok: false }, 502)
        }
        return json({ ok: true })
      },
    },
  },
})
