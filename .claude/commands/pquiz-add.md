---
description: Add a bar to punchlinequiz. Auto-creates artist/song if missing.
argument-hint: [artist | song | line] (free text, agent parses)
---

You are adding a punchline to the punchlinequiz database via the admin HTTP API.

## Input
The user's free-text arguments: `$ARGUMENTS`

Parse them into:
- `artist` (required)
- `song` (required, the track title)
- `line` (required, the bar — keep original casing and punctuation)
- `album` (optional)
- `releaseYear` (optional, integer 1980–2100)

If anything required is unclear, ask **one** concise clarifying question. Otherwise proceed.

## How to call

Use `Bash`:

```bash
BASE="${PQUIZ_BASE_URL:-http://localhost:3002}"
curl -sS -X POST "$BASE/api/admin/bars" \
  -H "Authorization: Bearer $PQUIZ_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '<JSON payload>'
```

The token + base URL come from the user's environment (`PQUIZ_ADMIN_TOKEN`, `PQUIZ_BASE_URL`). Do **not** hardcode them. If `PQUIZ_ADMIN_TOKEN` is empty, tell the user to export it and stop.

## How to report

- `201` → "Added bar #ID under <artist> — <song>". If `created.artist` or `created.song` is true, say so explicitly so the user knows new entities were minted.
- `409 duplicate_line` → "Already exists: bar #<existingId>. Skipped." Do not retry.
- `400` → quote the `message`. Ask the user to fix the field.
- `401` → "Token rejected — check `PQUIZ_ADMIN_TOKEN`."
- Other → print status + body.

Keep the final reply to 1–2 lines.
