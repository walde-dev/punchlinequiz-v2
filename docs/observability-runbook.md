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
| **Sentry** | Exceptions, stack traces, breadcrumbs | `session_id` tag + Clerk `user.id`, set per-request in `lib/sentry-scope.ts`; a `flow` tag (`challenge_play` / `daily_submit` / `admin`) is derived from the path |
| **Axiom** | Structured info/warn/error logs + game events | `session_id` field on every record (`lib/log.ts`, `lib/track.ts`) + Vercel server-log drain |
| **`gameEvents` DB** | Durable event record (the source of truth) | `session_id` column, written by `recordEvent` |

Because the id is identical across all three, you can pivot freely: a Sentry
error → its `session_id` → the full Axiom/DB timeline around the failure.

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

### 5. Errors for a signed-in user (Sentry)
*"Show Sentry events where `user.id` == `<CLERK_USER_ID>` in the last 7 days."*
(Anonymous-only sessions won't have a user; pivot on `session_id` instead.)

### 6. A specific flow misbehaving (Sentry)
*"Show errors tagged `flow:daily_submit` in the last 24h"* — fast triage of a single surface (challenge play, daily submit, admin).

## Worked example
1. Bug report: "the daily quiz won't submit." You have the user's `session_id` (from a support message / URL / error context).
2. Run query #1 → timeline shows `guess_submitted` events, then an `error` log on the submit path.
3. Cross-check Sentry filtered to `session_id:<SID>` (query #4) → the exception + source-mapped stack.
4. Fix, ship, mark the Sentry issue resolved (a regression alert fires if it comes back — see `logging-observability.md` → Alerting).
