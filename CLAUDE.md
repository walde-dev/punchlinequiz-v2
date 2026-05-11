# Logging Rules

## Always Aggressive Log

Every discrete user action gets a structured event. No exceptions.

### Why
Paste a session_id into an LLM with Axiom MCP → replay the entire user timeline → debug anything. No guessing, no "can you reproduce it?"

### Stack
- Axiom (free tier: 500MB/month)
- Vercel log drain (automatic server logs)
- Axiom MCP (LLM queries)

### How

**Client-side** — fire-and-forget via `sendBeacon`:
```typescript
logEvent("event_name", { key: "value" });
```

**Server-side** — forward to Axiom ingest API:
```typescript
logToAxiom("event_name", { key: "value" });
```

### Event Format
```json
{ "event": "verb_noun", "session_id": "uuid", "key": "value", "timestamp": "ISO8601" }
```

### What to Log
- Every user action: clicks, submissions, selections
- Every state change: created, updated, deleted
- Every error: API errors, validation failures
- Every distribution moment: shares, referrals
- Include enough context to reconstruct what happened

### Rules
- Log first, optimize later. Over-logging > under-logging.
- No PII. Session IDs are anonymous UUIDs. No IPs, emails, names.
- Non-blocking. `sendBeacon` from client, fire-and-forget from server.
- Structured JSON always. Never plain text.
- Always include `session_id` and `timestamp`.
