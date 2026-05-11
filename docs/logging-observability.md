# Logging & Observability

## Philosophy

Aggressive logging from day 1. Every user action is a discrete event. Over-log at first, trim back later. The goal: paste a session_id or user identifier into an LLM connected to Axiom MCP → replay the entire user timeline → debug anything.

Inspired by Brian Lovin's approach: OTel traces + manual event capture + Vercel log drain → Axiom → LLM via MCP.

## Stack

- **Axiom** — log aggregation (free tier: 500MB/month, enough for months)
- **Vercel Log Drain** — native integration, automatic server-side logs
- **Axiom MCP** — connect LLM for debugging queries
- **Manual event capture** — client-side events sent to a lightweight API route

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
- Create a lightweight API route: `POST /api/events`
- Client sends structured events on key actions
- API route forwards to Axiom via their ingest API
- Non-blocking: fire-and-forget from client

### 4. Axiom MCP (for LLM debugging)
- Install Axiom MCP server
- Connect to your LLM (Claude, Cursor, etc.)
- Query pattern: "show me all events for session_id abc123 in the last 24 hours"
- LLM replays user timeline and identifies issues

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

- Generate a UUID on first visit, store in localStorage
- Attach to every event (client-side and server-side)
- No auth required — anonymous session tracking
- If user later creates an account, link session_id to user_id

## Debugging Workflow

### Bug Report Comes In
1. User says "the quiz is broken" (or you see an error in Axiom)
2. Get their session_id (from URL param, support request, or error context)
3. Open LLM with Axiom MCP connected
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
AXIOM_TOKEN=your_axiom_api_token
AXIOM_DATASET=punchlinequiz
```
