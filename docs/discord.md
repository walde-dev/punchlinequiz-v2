# Discord — Community Bot & Server

The community server (**punchline/quiz**, guild `1341150349968412804`) plus a
fully **serverless** bot living in `apps/web`. No always-on gateway process —
just Discord's REST + HTTP-interactions APIs, so everything runs on Vercel.

## What runs where

| Piece                                          | Where                                                                    | Notes                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Server scaffolding                             | `scripts/discord/setup.ts`                                               | One-time/idempotent. Channels, roles, perms, server settings. |
| Slash commands `/daily` `/play` `/leaderboard` | `apps/web/src/routes/api/discord/interactions.ts`                        | HTTP interactions, ed25519-verified.                          |
| Command registration                           | `scripts/discord/register-commands.ts`                                   | Guild-scoped (instant). Re-run on command changes.            |
| Daily 18:00 auto-post                          | `apps/web/src/routes/api/cron/discord-daily.ts` + `apps/web/vercel.json` | Posts the bar to `#punchline-des-tages`.                      |
| Welcome message                                | Discord native "X joined" → `#willkommen`                                | No code (set via `system_channel_id`).                        |
| `#willkommen` / `#ankündigungen` copy          | `scripts/discord/post-welcome.ts`                                        | Idempotent (edits its own message).                           |
| Shared helpers                                 | `apps/web/src/lib/discord.ts`                                            | REST, signature verify, message payloads.                     |

Created IDs are written to `.context/discord-ids.json` (gitignored).

## Structure

- **📌 START** (read-only): `willkommen`, `ankündigungen`, `punchline-des-tages`
- **🎤 DEUTSCHRAP**: `allgemein`, `releases`, `bars`
- **🎮 DAS QUIZ**: `highscores`, `bar-vorschläge`
- **🛠️ FEEDBACK**: `ideen-feedback`, `bugs`
- **🔊 VOICE**: `Lobby`
- **🔒 STAFF** (admin-only — hidden from `@everyone`; Administrator roles bypass): `logs`, `alerts`, `review-queue`, `bot-status`
- Roles: **Admin** (gold, you) → **Team** (mod perms) → **OG** (bronze, flair) → `@everyone`

## Staff channel wiring

The Admin role has Administrator, which bypasses channel overwrites — so admins
(and the bot, and the owner) see the STAFF category for free; everyone else,
**including Team**, is blocked by the `@everyone` View-Channel deny.

- **`#alerts`** ← every `logServer("error", …)` is forwarded here, fire-and-forget
  (`lib/discord-rest.ts` `notifyError`; no-op unless `DISCORD_ALERTS_CHANNEL_ID`
  is set; failures go to console, never back through `logServer`, so no recursion).
- **`#review-queue`** ← each new user bar submission (`lib/submissions.ts` →
  `notifyNewSubmission`), with a link to `/admin/review`.
- **`#alerts`** also receives **Sentry** issue alerts via a thin bridge:
  Sentry → `POST /api/sentry/discord?key=<SENTRY_WEBHOOK_SECRET>` → our bot
  formats + posts. This is how real exceptions reach Discord (the in-app
  `logServer("error")` path only covers explicitly-instrumented server events,
  which is currently just two Discord-integration failure cases). Setup is in
  Sentry's UI — see the checklist below.
- `#logs` and `#bot-status` exist but nothing auto-posts to them yet (left for
  later; full event stream lives in Axiom).

> **Two `.env` files:** scripts (`pnpm discord:*`) read the repo-root `.env`;
> the app at runtime reads `apps/web/.env`. The Discord/Sentry vars are mirrored
> into both locally. In production only **Vercel env** matters.

## Daily post & DST

The daily resets at midnight Europe/Berlin and the post fires at **18:00 Berlin**.
Vercel Cron is UTC and DST-blind, so `vercel.json` fires the endpoint at **both
16:00 and 17:00 UTC**; the handler's `berlinHour() !== 18` guard ensures exactly
one of those actually posts (16:00 UTC in summer, 17:00 UTC in winter). No daily
scheduled for the day → silent skip + an `info` log. The post only ever exposes
the bar line + sequential number — never the artist/song answer.

## Required env (local `.env` + Vercel)

```
DISCORD_BOT_TOKEN=         # secret — bot password
DISCORD_PUBLIC_KEY=        # verifies interaction signatures
DISCORD_APPLICATION_ID=    # bot user id (command registration)
DISCORD_GUILD_ID=          # 1341150349968412804
DISCORD_DAILY_CHANNEL_ID=  # #punchline-des-tages (from discord-ids.json)
DISCORD_ALERTS_CHANNEL_ID= # #alerts (staff) — error forwarding
DISCORD_REVIEW_CHANNEL_ID= # #review-queue (staff) — new submissions
CRON_SECRET=               # any random string; Vercel sends it to the cron
SENTRY_WEBHOOK_SECRET=     # fallback ?key= gate for POST /api/sentry/discord
SENTRY_CLIENT_SECRET=      # Sentry internal-integration Client Secret (HMAC verify)
```

## Sentry → #alerts (real exception alerts)

1. Add `SENTRY_WEBHOOK_SECRET` (any random string) + `DISCORD_ALERTS_CHANNEL_ID`
   to Vercel and deploy.
2. In Sentry: **Settings → Developer Settings → Internal Integration** (or a
   project **Issue Alert → action "Send a notification via webhook"**) with URL:
   `https://www.punchlinequiz.de/api/sentry/discord?key=<SENTRY_WEBHOOK_SECRET>`
3. Trigger a test error → it lands in `#alerts` as a formatted embed.

The endpoint gates on `?key=` (Sentry's legacy webhooks are unsigned), parses
both the legacy and internal-integration payload shapes, and posts via our bot
(so it works even though `#alerts` is locked to admins).

## Deploy / handoff checklist

1. Add all env vars above to **Vercel** (Production + Preview).
2. Confirm the Vercel project **Root Directory = `apps/web`** (where `vercel.json`
   lives) so the cron is picked up. If the root is the repo root, move
   `vercel.json` there.
3. Deploy.
4. Discord Developer Portal → your app → **General Information** →
   **Interactions Endpoint URL** = `https://www.punchlinequiz.de/api/discord/interactions`
   → Save (Discord pings it; the 401-on-bad-signature handling makes this pass).
   **Use the `www` host** — the apex `punchlinequiz.de` 308-redirects to `www`
   and Discord does NOT follow redirects, so the apex URL fails verification.
5. Test `/daily`, `/play`, `/leaderboard` in the server.
6. Manually trigger the daily once: `GET /api/cron/discord-daily?force=1` with
   header `Authorization: Bearer <CRON_SECRET>`.

## Local commands

```
pnpm discord:setup           # build/reconcile the server
pnpm discord:register         # (re)register slash commands
pnpm discord:post-welcome     # post/update the rules + launch copy
```

## Known loose ends

- The pre-existing **`punchline/quiz team`** role sits above the bot's role, so
  the script can't touch it. Delete it by hand in the UI if it's redundant with
  the new **Team** role.
- Admin role grants don't change owner power — you're owner regardless. The role
  is for the gold color + hoist.
