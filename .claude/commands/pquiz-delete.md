---
description: Soft-delete (deactivate) a bar; pass --hard to permanently remove.
argument-hint: <id> [--hard]
---

Delete a punchline via `DELETE /api/admin/bars/<id>`.

## Input
Free-text: `$ARGUMENTS`. Expect an integer id. If `--hard` appears anywhere, do a hard delete.

## Safety
**Hard delete is irreversible.** Before issuing `?hard=true`, confirm with the user once in chat unless they already wrote `--hard yes` in the arguments.

## How to call

```bash
BASE="${PQUIZ_BASE_URL:-http://localhost:3002}"
# Soft:
curl -sS -X DELETE "$BASE/api/admin/bars/<id>" \
  -H "Authorization: Bearer $PQUIZ_ADMIN_TOKEN"
# Hard:
curl -sS -X DELETE "$BASE/api/admin/bars/<id>?hard=true" \
  -H "Authorization: Bearer $PQUIZ_ADMIN_TOKEN"
```

## How to report

- `200` soft → "Deactivated #<id>."
- `200` hard → "Hard-deleted #<id>."
- `404` → "No bar with id #<id>."
- Other → status + body.
