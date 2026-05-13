---
description: Add a bar to punchlinequiz. Auto-creates artist/song if missing.
argument-hint: [artist | song | line] (free text, agent parses)
---

You are adding a punchline to the punchlinequiz database via the admin HTTP API.

## Input
The user's free-text arguments: `$ARGUMENTS` — may also be a screenshot of a bar, or just the line plus the correct artist. Missing data is expected.

Resolve into:
- `artist` (required)
- `song` (required, the track title)
- `line` (required, the bar — keep original casing and punctuation; if from a screenshot, transcribe verbatim; normalize line breaks: every bar/line must end with ` /` — add it if missing, but do not double it if already present. Example: `"ich gehe in ein Haus / sehe dort eine Maus /"`)
- `distractor1` (required, artist name — first wrong choice)
- `distractor2` (required, artist name — second wrong choice; must differ from `artist` and `distractor1`)
- `album` (optional)
- `releaseYear` (optional, integer 1980–2100)

### Best-effort fill for missing fields
Do **not** stop to ask for missing `song`, `album`, `releaseYear`, or distractors. Instead:

1. **Song / album / year** — run a quick `WebSearch` for the line + artist (e.g. `"<line excerpt>" <artist> lyrics`). Pull the track from Genius/lyrics aggregators; cross-check album/year from a second result if convenient. If the song still can't be pinned down with reasonable confidence, ask one short clarifying question — otherwise proceed.
2. **Distractors** — pick two plausible artists from the same scene/era as `artist` (similar style, similar years, German rap context if applicable). They should make a knowledgeable fan hesitate, not be obvious throwaways. No need to search the DB; auto-creation handles unknowns, but well-known peers are preferred.

Distractors render verbatim in randomized order in the UI.

Only ask a clarifying question if the **line itself** or the **correct artist** is ambiguous — never for the auto-fillable fields above.

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
