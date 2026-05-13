---
description: Edit a punchlinequiz bar by id (line text, active flag, solutions).
argument-hint: <id> <field=value …>
---

Edit a punchline via PATCH `/api/admin/bars/<id>`.

## Input
Free-text: `$ARGUMENTS`. Expect the first token to be the integer id; remaining tokens are `field=value` pairs.

Recognized fields:
- `line` — string, new bar text
- `active` — `true` | `false`
- `perfectSolution` — JSON array of strings, e.g. `'["Boss"]'`
- `acceptableSolutions` — JSON 2D array, e.g. `'[["boss"],["king"]]'`

If id is missing or no fields given, ask **one** clarifying question.

## How to call

```bash
BASE="${PQUIZ_BASE_URL:-http://localhost:3002}"
curl -sS -X PATCH "$BASE/api/admin/bars/<id>" \
  -H "Authorization: Bearer $PQUIZ_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '<JSON patch object with only the fields the user wants to change>'
```

## How to report

- `200` → "Updated #<id>: <fields changed>."
- `404` → "No bar with id #<id>."
- Other → status + body in one line.
