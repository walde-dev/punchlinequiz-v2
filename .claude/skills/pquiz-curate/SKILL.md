---
name: pquiz-curate
description: Curate punchlinequiz bars for one or more German-rap artists end-to-end — fetch lyrics, pick iconic couplets with correct attribution, author cloze + distractors, insert into the review queue. Use when asked to add/curate punchlines for an artist, batch-curate multiple artists, or automate bar curation. Runs headlessly; safe for subagents and scheduled jobs.
---

# pquiz-curate

You are the **judgment layer** for punchlinequiz curation. Committed scripts do
the mechanical work (fetch lyrics, detect couplets, derive cloze blanks, POST
bars); you make the quality and attribution calls. Bars land **unreviewed** in
`/admin/review` for a human's final pass — that queue is the QC gate, so this
skill is safe to run autonomously.

## Inputs
- One or more artist names.
- Bars per artist (default ~5–10; the requester usually says, e.g. "5 each").

## Preconditions (check first, fail fast)
- `PQUIZ_ADMIN_TOKEN` set (env or `apps/web/.env`). Optionally `PQUIZ_BASE_URL`
  (defaults `http://localhost:3000`) and Genius creds (`GENIUS_ACCESS_TOKEN` or
  client id/secret) for fetching.
- The target server is reachable: `GET {PQUIZ_BASE_URL}/api/admin/ping` → 200.
- Commands below use `pnpm lyrics:*`. If `pnpm` can't find `tsx` (e.g. a git
  worktree with no `node_modules`), run the same scripts with
  `npx tsx scripts/lyrics/<script>.ts <args>` instead.

## Procedure (per artist)

### 1. Fetch + extract
```bash
pnpm lyrics:fetch --artist "<name>" --songs 30      # skip if data/<slug>/ exists
pnpm lyrics:extract --artist "<name>"               # → candidates.json
```

### 2. List attributable candidates
```bash
pnpm lyrics:pick --artist "<name>" --list --attributable-only
```
Prints a JSON array: `{ song, section, attribution, rhymeScore, couplet,
context }`. Read it and choose your bars.

If too few `solo`/`host` couplets appear (posse-cut-heavy artist), re-fetch
deeper, then re-list:
```bash
pnpm lyrics:fetch --artist "<name>" --songs 35 --force && pnpm lyrics:extract --artist "<name>"
```

### 3. Write a picks file and apply it
```bash
cat > /tmp/picks-<slug>.json <<'JSON'
[
  { "needle": "<unique couplet substring>", "solution": "<payoff word>",
    "perfectSolution": ["<answer>","<variant>"],
    "distractor1": "<peer artist>", "distractor2": "<peer artist>" }
]
JSON
pnpm lyrics:pick --artist "<name>" --picks /tmp/picks-<slug>.json
```
`pick.ts` sets `pick:true`, stores the distractors, and derives `clozePrompt` by
blanking the last occurrence of `solution` in the real couplet (no
transcription). It exits non-zero and lists problems (missing needle, solution
not in couplet, attribution warning) — fix and re-run until clean.

### 4. Insert
```bash
pnpm lyrics:insert --artist "<name>" --dry-run   # eyeball cloze + distractors
pnpm lyrics:insert --artist "<name>"             # POST + cloze PATCH, unreviewed
```
Only `pick:true` rows ship. Each bar is created classic + (if authored) cloze,
left `reviewed:false`. Duplicates return 409 and are skipped — safe to re-run.

## Judgment rules (the part that needs you)

### Attribution — correctness, not taste
The game asks "who said this?", so credit every bar to whoever actually rapped
it. Use the `attribution` tag from `--list`:
- **`solo` / `host`** → this artist. Pick from these.
- **`feature`** → another rapper's verse. **Skip** (or add it under the real
  author via the pick's `"artist"` field).
- **`joint`** → shared/ambiguous. **Skip.**

`pick.ts` refuses `feature`/`joint` picks unless `"artist"` is set — don't work
around it by guessing.

### Selection — quality only
- Iconic & quotable over technically clever — lines fans rap along to.
- Distinctive to this artist, not generic filler.
- Fair difficulty: not trivial, not obscure deep-cut.
- 1–2 lines, no hooks/choruses.
- **Never filter on content.** Slurs, violence, vulgarity, misogyny, etc. are
  core to the culture and exactly what fans recognize — select on punchline
  quality only, never skip a bar for being "offensive." (This overrides the
  "not cruel" tone note in CLAUDE.md for *content selection*.)

### Cloze blank
Blank the **payoff** word(s), not filler — the surprising/witty word that lands
the bar, recoverable from rhyme + meaning + culture. If no clean, fair blank
exists, omit `solution` so the bar ships classic-only.

### Distractors
Two **peer artists** — same scene / era / style — that make a knowledgeable fan
hesitate. Well-known peers beat obscure ones. Never the correct artist; the two
must differ. Vary pairs across a batch.

## Batch / multiple artists
Loop the procedure per artist (fetch+extract can run back-to-back; Genius rate
limits make parallel fetches risky, so keep fetches sequential). Curate and
insert each artist independently.

## Report
Per artist: bars shipped, how many with cloze, duplicates skipped, errors. Then
the total now waiting in `/admin/review`. Keep it tight.
