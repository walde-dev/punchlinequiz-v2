/**
 * Lightweight Discord REST core + fire-and-forget staff notifications.
 *
 * Kept dependency-free (no db/crypto) so it can be imported from hot paths like
 * log.ts and submissions.ts without dragging the heavy discord.ts bundle along.
 *
 * Env: DISCORD_BOT_TOKEN, DISCORD_ALERTS_CHANNEL_ID, DISCORD_REVIEW_CHANNEL_ID.
 */
import { SITE_URL } from "./seo"

const API = "https://discord.com/api/v10"
const GOLD = 0xfbbf24
const RED = 0xef4444

export async function discordRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T | null> {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new Error("DISCORD_BOT_TOKEN missing")
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(
      `Discord ${method} ${path} → ${res.status}: ${await res.text()}`
    )
  }
  return res.status === 204 ? null : ((await res.json()) as T)
}

export function postMessage(
  channelId: string,
  payload: Record<string, unknown>
) {
  return discordRequest("POST", `/channels/${channelId}/messages`, payload)
}

/**
 * Fire-and-forget post to a staff channel. No-ops when the channel/token is
 * unset, never throws, and logs failures to console only (NOT logServer — that
 * would recurse on the error-alert path).
 */
function notify(
  channelId: string | undefined,
  payload: Record<string, unknown>
): void {
  if (!channelId || !process.env.DISCORD_BOT_TOKEN) return
  void postMessage(channelId, payload).catch((e) => {
    console.error(
      "[discord notify] failed:",
      e instanceof Error ? e.message : e
    )
  })
}

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s

/** #alerts ← an error-level server log record. */
export function notifyError(record: Record<string, unknown>): void {
  const { level: _l, timestamp: _t, event, ...rest } = record
  const detail = truncate(JSON.stringify(rest, null, 2), 1400)
  notify(process.env.DISCORD_ALERTS_CHANNEL_ID, {
    embeds: [
      {
        title: `⚠️ ${String(event ?? "error")}`,
        description: "```json\n" + detail + "\n```",
        color: RED,
      },
    ],
  })
}

/** #review-queue ← a freshly submitted bar awaiting moderation. */
export function notifyNewSubmission(sub: {
  id: number
  line: string
  artistHint?: string | null
  songHint?: string | null
  answer?: string | null
}): void {
  const meta = [
    sub.artistHint && `Artist: ${sub.artistHint}`,
    sub.songHint && `Song: ${sub.songHint}`,
    sub.answer && `Lösung: ${sub.answer}`,
  ]
    .filter(Boolean)
    .join(" · ")
  notify(process.env.DISCORD_REVIEW_CHANNEL_ID, {
    embeds: [
      {
        title: "📝 Neuer Bar-Vorschlag",
        description:
          `> ${truncate(sub.line, 500)}` +
          (meta ? `\n\n${meta}` : "") +
          `\n\nPrüfen 👉 ${SITE_URL}/admin/review`,
        color: GOLD,
        footer: { text: `Submission #${sub.id}` },
      },
    ],
  })
}
