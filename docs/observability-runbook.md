# Observability Runbook — diagnose from a `session_id`

The goal: paste a `session_id` (or a Sentry error) into an LLM with the Sentry +
Axiom MCP servers connected, and have it replay the user's timeline and name the
failure. This doc is the query cookbook for that workflow.

## The join key

Every signal is keyed by the anonymous **`session_id`** (a UUID minted client-side
in `getSessionId()`, mirrored to the `pq_sid` cookie so the server sees the same
id). When a user is signed in, the **Clerk user id** is also attached.

| Surface | What it holds | How `session_id` gets there |
| --- | --- | --- |
| **Sentry (client-only)** | **Client** exceptions + stack traces | `session_id` tag set at client init (`lib/sentry.client.ts`). Server exceptions are NOT in Sentry — see below. |
| **Axiom** | Structured info/warn/error logs (incl. **server** errors) + game events | `session_id` field on every record (`lib/log.ts` reads the `pq_sid` cookie, `lib/track.ts`) + optional Vercel log drain |
| **`gameEvents` DB** | Durable event record (the source of truth) | `session_id` column, written by `recordEvent` |

The id is identical across all three, so you can pivot freely. **Note:** Sentry
holds *client* errors only (server-side Sentry is disabled — bundler constraint);
for server-side failures, the timeline lives in **Axiom + the DB**, not Sentry.

## Connecting the MCP servers

- **Sentry MCP** — hosted; connect with the org/project. Lets the agent list issues, read a specific issue's events, stack traces, and tags.
- **Axiom MCP** — connect with an Axiom API token scoped to the `punchlinequiz` dataset. Lets the agent run APL queries.
- **DB** — when Axiom retention (30 days, free tier) has lapsed, the `gameEvents` table is the durable fallback; query it directly.

## Query patterns

### 1. Replay a session timeline (Axiom, APL)
```apl
['punchlinequiz']
| where session_id == "<SID>"
| where _time > ago(24h)
| sort by _time asc
| project _time, level, event, endpoint, error_message, is_correct, artist_id, punchline_id
```
Ask the agent: *"Replay session `<SID>` over the last 24h, ordered by time, and tell me where it broke."*

### 2. Same timeline from the DB (fallback / beyond Axiom retention)
```sql
select created_at, name, props
from game_events
where session_id = '<SID>'
order by created_at asc;
```

### 3. Top errors this week (Sentry)
*"List the top unresolved Sentry issues for project punchlinequiz in the last 7 days by event count, with their `flow` tag."*

### 4. One error's recent occurrences + the session behind it (Sentry → Axiom)
1. *"Show the most recent events for Sentry issue `<ID>` and their `session_id` tag."*
2. Take a `session_id`, run query #1 to see what the user did right before.

### 5. Errors for a specific session (Sentry → client errors)
*"Show Sentry events with tag `session_id == <SID>` in the last 7 days."*
Sentry holds **client** errors only; for server-side failures of that session,
use Axiom (query #1). Clerk user / `flow` filtering aren't available while
Sentry is client-only — segment in Axiom on the event props instead.

### 6. A specific flow misbehaving (Axiom)
*"In the last 24h, show error-level logs where `endpoint` / `event` matches the daily-submit path"* — server-side flow triage lives in Axiom, not Sentry.

## Worked example
1. Bug report: "the daily quiz won't submit." You have the user's `session_id` (from a support message / URL / error context).
2. Run query #1 → timeline shows `guess_submitted` events, then an `error` log on the submit path (server error → Axiom).
3. If the failure was client-side, cross-check Sentry filtered to `session_id:<SID>` (query #5) for the browser exception.
4. Fix and ship.
