# Logging & Observability

## Philosophy

Aggressive logging from day 1. Every user action is a discrete event. Over-log at first, trim back later. The goal: paste a session_id or user identifier into an LLM connected to Axiom MCP → replay the entire user timeline → debug anything.

Inspired by Brian Lovin's approach: OTel traces + manual event capture + Vercel log drain → Axiom → LLM via MCP.

> **App stack:** TanStack Start + Nitro on Vercel (not Next.js — older drafts of
> this doc used Next.js samples; the code below reflects the real implementation).

## Stack

- **Sentry** — exception tracking (grouping, source-mapped stacks, releases, alerts). Errors-only at launch. See "Sentry" below and the agent runbook (`docs/observability-runbook.md`).
- **Axiom** — log aggregation (free tier: 500MB/month, enough for months)
- **Vercel Log Drain** — native integration, automatic server-side logs → Axiom
- **Axiom MCP + Sentry MCP** — connect an LLM for debugging queries
- **gameEvents DB table** — every tracked event is also persisted to Postgres (the durable record; Axiom is the queryable log layer)
- **Manual event capture** — client-side events sent via a TanStack **server function** (`recordEvent` in `lib/track.ts`), which persists to `gameEvents` and forwards to Axiom

## Setup

### 1. Axiom Account
- Create account at axiom.co
- Create dataset: `punchlinequiz`
- Get API token

### 2. Vercel Log Drain
- In Vercel dashboard → Project → Integrations → Axiom
- Connect and enable log drain
- All server logs (API routes, server actions, errors) automatically flow to Axiom

### 3. Client-Side Event Logging
- Implemented in `apps/web/src/lib/track.ts` as a TanStack **server function** (`recordEvent`), not a REST route.
- `logEvent(name, props)` (client) → `recordEvent` (server) → persists to the `gameEvents` table **and** forwards to Axiom via `forwardToAxiom` (`lib/axiom.ts`).
- Non-blocking: fire-and-forget from the client; failures are swallowed so tracking never breaks gameplay.

### 4. Sentry (exceptions) — **client-only**
- SDK: `@sentry/tanstackstart-react`, loaded **only on the client** via a dynamic import behind `import.meta.env.SSR` in `lib/sentry.client.ts` (imported by `router.tsx`), plus the route `errorComponent` in `__root.tsx`.
- **Why not server-side:** this nitro@3-beta setup inlines all deps (ships no `node_modules`), and `@sentry/node` can't be bundled (rollup `export *` crash). Any server-side `@sentry` import therefore breaks the deployed function. So **server exceptions are NOT in Sentry** — they're captured as structured Axiom logs instead (`logServer`, once wired). Re-introducing server Sentry needs a bundler-compatible approach (rolldown, or a nitro that ships externals).
- Errors-only (`tracesSampleRate: 0`). Client init tags `session_id` so client errors correlate with Axiom + the gameEvents DB.
- Env: `VITE_SENTRY_DSN` (client; `SENTRY_DSN` retained for a future server path). `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_URL` are for source-map upload, which is **currently deferred** (plugin removed) — client stacks are minified until re-added.

### 5. Axiom MCP + Sentry MCP (for LLM debugging)
- Connect both MCP servers to your LLM (Claude, Cursor, etc.).
- Query pattern: "show me all events for session_id abc123 in the last 24 hours".
- LLM replays the user timeline across Sentry + Axiom + the DB and identifies issues. Full patterns in `docs/observability-runbook.md`.

## Events to Track

### Core Game Events
```json
{
  "event": "punchline_viewed",
  "session_id": "abc123",
  "punchline_id": 47,
  "artist_id": "kollegah",
  "timestamp": "2026-05-11T20:15:00Z"
}

{
  "event": "guess_submitted",
  "session_id": "abc123",
  "punchline_id": 47,
  "artist_id": "kollegah",
  "guess_text": "Boss",
  "is_correct": true,
  "attempt_number": 1,
  "timestamp": "2026-05-11T20:15:30Z"
}

{
  "event": "solution_revealed",
  "session_id": "abc123",
  "punchline_id": 47,
  "artist_id": "kollegah",
  "attempt_number": 3,
  "timestamp": "2026-05-11T20:16:00Z"
}

{
  "event": "round_completed",
  "session_id": "abc123",
  "artist_id": "kollegah",
  "correct": 7,
  "total": 10,
  "duration_seconds": 180,
  "timestamp": "2026-05-11T20:20:00Z"
}
```

### Distribution Events
```json
{
  "event": "share_clicked",
  "session_id": "abc123",
  "artist_id": "kollegah",
  "correct": 7,
  "total": 10,
  "platform": "whatsapp",
  "timestamp": "2026-05-11T20:20:30Z"
}

{
  "event": "artist_selected",
  "session_id": "abc123",
  "artist_id": "haftbefehl",
  "source": "grid_click",
  "timestamp": "2026-05-11T20:10:00Z"
}
```

### Error Events
```json
{
  "event": "api_error",
  "session_id": "abc123",
  "endpoint": "/api/punchline/random",
  "error_message": "No punchlines found for artist xyz",
  "status_code": 404,
  "timestamp": "2026-05-11T20:10:05Z"
}
```

## Session ID Strategy

- Generate a UUID on first visit, store in localStorage (`getSessionId`, `lib/track.ts`).
- **Mirror it into the `pq_sid` cookie** so server functions, server logs, and Sentry scope read the same id — this is what makes server-side errors correlate to the client timeline.
- Attach to every event (client + server logs). Sentry is client-only, so its `session_id` tag is set in `lib/sentry.client.ts` at init (covers client errors); server errors carry `session_id` via the Axiom log record (`logServer` reads the `pq_sid` cookie).
- No auth required — anonymous. (Clerk user is not attached to Sentry while Sentry is client-only.)

## Alerting

Sentry alert rules (high-signal only — tune thresholds against real traffic post-launch):
- **New issue** — first occurrence of a never-seen error.
- **Error-rate spike** — sudden jump vs baseline.
- **Regression** — a resolved issue reoccurs.

**Routing:** a Discord server will be wired later via Sentry's Discord/webhook integration. Until then, verify rules against Sentry's default channel (in-app/email); swapping in the Discord webhook is a routing change, not a code change.

## Debugging Workflow

See `docs/observability-runbook.md` for the full MCP query cookbook. Quick version:

### Bug Report Comes In
1. User says "the quiz is broken" (or you see an error in Sentry/Axiom)
2. Get their session_id (from URL param, support request, or error context)
3. Open LLM with Sentry MCP + Axiom MCP connected
4. Query: "Show me all events for session_id [id] in the last 24 hours, ordered by timestamp"
5. LLM replays the timeline:
   - "User selected Kollegah at 20:10"
   - "Viewed punchline #47 at 20:15"
   - "Guessed 'Boss' (correct) at 20:15:30"
   - "Guessed 'Hurensohn' (incorrect) on punchline #48 at 20:16"
   - "API returned 404 on punchline #49 — artist_id 'shindy' has no punchlines"
   - "Found the bug: Shindy has no punchlines in the database"
6. Fix and ship

### Performance Analysis
- Query: "What's the average time between guess_submitted and round_completed?"
- Query: "Which artists have the highest drop-off rate?"
- Query: "What are the most common wrong guesses for Kollegah punchline #12?"

## PII Scrubbing

- Do NOT log IP addresses, user agents, or any personal data
- session_id is an anonymous UUID — not linked to identity
- If user creates an account, only log user_id (not email, name, etc.)
- Guess text is fine to log (it's game data, not PII)
- Share platform is fine to log (whatsapp, instagram, twitter)

## Implementation Notes

### Client-Side (fire-and-forget)
```typescript
// lib/logger.ts
export function logEvent(event: string, data: Record<string, unknown>) {
  const session_id = localStorage.getItem("session_id");
  navigator.sendBeacon("/api/events", JSON.stringify({
    event,
    session_id,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}
```

### Server-Side API Route
```typescript
// app/api/events/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  // Forward to Axiom ingest API
  await fetch("https://api.axiom.co/v1/datasets/punchlinequiz/ingest", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.AXIOM_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([body]),
  });
  return NextResponse.json({ ok: true });
}
```

### Server-Side (direct logging in server actions)
```typescript
// In server actions, log directly to Axiom
async function logToAxiom(event: string, data: Record<string, unknown>) {
  await fetch("https://api.axiom.co/v1/datasets/punchlinequiz/ingest", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.AXIOM_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ event, ...data, timestamp: new Date().toISOString() }]),
  });
}
```

## Cost

- Axiom free tier: 500MB/month ingest, 30-day retention
- A quiz app with 1,000 users/day generating ~10 events each = ~10K events/day
- Each event ~200 bytes = ~2MB/day = ~60MB/month
- You'll be well within the free tier for months
- Upgrade path: $25/month for 10GB if you scale

## Environment Variables

```
AXIOM_TOKEN=your_axiom_api_token          # ingest capability (app); add query for MCP
AXIOM_DATASET=punchlinequiz
AXIOM_URL=https://eu-central-1.aws.edge.axiom.co   # EU edge; omit for US (defaults to api.axiom.co)
```

**Region gotcha:** ingest is pinned to the dataset's edge deployment and uses the
`POST {AXIOM_URL}/v1/ingest/{dataset}` path. An EU-central dataset rejects the
default US host (`api.axiom.co`) with HTTP 400 — set `AXIOM_URL` to the EU edge.
The MCP/runbook query path additionally needs a token with **query** capability
(the app's ingest-only token can't read).

Sentry env (see also `.env.example`): `SENTRY_DSN` + `VITE_SENTRY_DSN` (runtime),
and `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_URL` (build-time
source maps; `SENTRY_URL=https://de.sentry.io` for EU orgs).
