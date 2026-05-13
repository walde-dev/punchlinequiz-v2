---
description: List bars in the punchlinequiz database with optional filters.
argument-hint: [artist? | search? | limit?]
---

List punchlines from the admin API.

## Input
Free-text: `$ARGUMENTS`. Parse out optional filters:
- `artist` — partial artist name
- `search` — substring inside the bar text
- `limit` — integer, default 25

## How to call

```bash
BASE="${PQUIZ_BASE_URL:-http://localhost:3002}"
curl -sS "$BASE/api/admin/bars?artist=...&search=...&limit=..." \
  -H "Authorization: Bearer $PQUIZ_ADMIN_TOKEN"
```

URL-encode filter values. Omit query params that weren't requested.

## How to report

Render a compact table: `#id  artist — song  · "<first 80 chars of line>…"`. End with `n total` from the response.

Keep the reply tight: header + rows + trailing total. No commentary.
