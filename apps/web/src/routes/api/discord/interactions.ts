import { createFileRoute } from "@tanstack/react-router"

import { json } from "../../../lib/admin"
import { logServer } from "../../../lib/log"
import {
  dailyPayload,
  getDailyForBroadcast,
  leaderboardPayload,
  noDailyPayload,
  playPayload,
  verifyDiscordSignature,
} from "../../../lib/discord"

// Discord interaction + response type enums (the subset we use).
const INTERACTION_PING = 1
const INTERACTION_COMMAND = 2
const RESPONSE_PONG = 1
const RESPONSE_MESSAGE = 4

/**
 * Discord Interactions Endpoint — handles slash commands over HTTP (no gateway).
 * Set this URL in the Discord Developer Portal → General Information →
 * "Interactions Endpoint URL": https://punchlinequiz.de/api/discord/interactions
 *
 * Every request is ed25519-signed; we MUST reject bad signatures with 401 (the
 * portal verifies this when you save the URL).
 */
export const Route = createFileRoute("/api/discord/interactions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text()
        const valid = verifyDiscordSignature(
          raw,
          request.headers.get("x-signature-ed25519"),
          request.headers.get("x-signature-timestamp")
        )
        if (!valid) {
          return new Response("invalid request signature", { status: 401 })
        }

        const body = JSON.parse(raw) as {
          type: number
          data?: { name?: string }
        }

        if (body.type === INTERACTION_PING) {
          return json({ type: RESPONSE_PONG })
        }

        if (body.type === INTERACTION_COMMAND) {
          const name = body.data?.name
          logServer("info", "discord_command", { command: name })
          try {
            if (name === "daily") {
              const daily = await getDailyForBroadcast()
              return json({
                type: RESPONSE_MESSAGE,
                data: daily ? dailyPayload(daily) : noDailyPayload(),
              })
            }
            if (name === "play") {
              return json({ type: RESPONSE_MESSAGE, data: playPayload() })
            }
            if (name === "leaderboard") {
              return json({
                type: RESPONSE_MESSAGE,
                data: await leaderboardPayload(),
              })
            }
          } catch (err) {
            logServer("error", "discord_command_failed", {
              command: name,
              error: err instanceof Error ? err.message : String(err),
            })
            return json({
              type: RESPONSE_MESSAGE,
              data: {
                content: "Da ist was schiefgelaufen. Versuch's gleich nochmal.",
              },
            })
          }
          return json({
            type: RESPONSE_MESSAGE,
            data: { content: "Unbekannter Befehl." },
          })
        }

        // Unhandled interaction type — acknowledge benignly.
        return json({ type: RESPONSE_PONG })
      },
    },
  },
})
