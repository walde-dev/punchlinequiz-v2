---
description: Check that the punchlinequiz admin API + token are working.
---

Run a one-shot health check against the admin API.

```bash
BASE="${PQUIZ_BASE_URL:-http://localhost:3002}"
curl -sS -w "\nHTTP %{http_code}\n" "$BASE/api/admin/ping" \
  -H "Authorization: Bearer $PQUIZ_ADMIN_TOKEN"
```

Report: `OK at <time>` on 200, or quote the error body on non-200.
