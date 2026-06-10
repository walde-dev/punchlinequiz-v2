import { createHmac, timingSafeEqual } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"

import { json } from "../../../lib/admin"
import { logServer } from "../../../lib/log"
import { postMessage } from "../../../lib/discord-rest"

const RED = 0xef4444 // error
const ORANGE = 0xf59e0b // warning
const GOLD = 0xfbbf24 // info / fallback

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Auth a Sentry webhook. Prefer the HMAC-SHA256 `Sentry-Hook-Signature` (signed
 * with the integration's Client Secret); fall back to the `?key=` shared secret
 * for manual/legacy posts. Returns true when no secret is configured (dev).
 */
function isAuthorized(request: Request, rawBody: string): boolean {
  const clientSecret = process.env.SENTRY_CLIENT_SECRET
  const sig = request.headers.get("sentry-hook-signature")
  if (clientSecret && sig) {
    const expected = createHmac("sha256", clientSecret)
      .update(rawBody, "utf8")
      .digest("hex")
    return safeEqual(sig, expected)
  }
  const keySecret = process.env.SENTRY_WEBHOOK_SECRET
  if (keySecret) {
    return new URL(request.url).searchParams.get("key") === keySecret
  }
  return true
}

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
 * Auth prefers the HMAC `Sentry-Hook-Signature` (SENTRY_CLIENT_SECRET) and
 * falls back to the `?key=` shared secret. Handles the legacy, alert-rule, and
 * internal-integration resource payload shapes defensively.
 */
export const Route = createFileRoute("/api/sentry/discord")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text()
        if (!isAuthorized(request, raw)) {
          return new Response("unauthorized", { status: 401 })
        }

        const channelId = process.env.DISCORD_ALERTS_CHANNEL_ID
        if (!channelId) {
          logServer("warn", "sentry_alert_no_channel", {})
          return json({ skipped: "DISCORD_ALERTS_CHANNEL_ID unset" })
        }

        let body: any = {}
        try {
          body = raw ? JSON.parse(raw) : {}
        } catch {
          return new Response("bad request", { status: 400 })
        }

        // Sentry's internal-integration `issue`/`error` webhook fires on EVERY
        // lifecycle change (created, resolved, assigned, ignored, archived …),
        // and this bridge posts whatever it receives. So resolving issues pages
        // #alerts with one "error" per resolve — e.g. clearing 9 issues spams 9
        // alerts. Drop administrative actions: an alert should mean a NEW or
        // regressed problem, never a state change we made ourselves. `created`
        // and `unresolved` (regression) pass; payloads without an `action`
        // (alert-rule / legacy webhooks) pass untouched.
        const action: unknown = body.action
        const ADMIN_ACTIONS = new Set([
          "resolved",
          "assigned",
          "unassigned",
          "ignored",
          "archived",
          "resolved_in_next_release",
          "resolved_in_release",
        ])
        if (typeof action === "string" && ADMIN_ACTIONS.has(action)) {
          return json({ skipped: `action=${action}` })
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
