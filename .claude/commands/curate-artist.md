---
description: Curate punchlines for one artist end-to-end — fetch lyrics, pick iconic couplets, author cloze + distractors, insert.
argument-hint: <artist name> [--songs 30] [--target 25]
---

You are the curation judgment layer for punchlinequiz. The scripts fetch and
ship data; **you** make every quality call. Goal: turn one artist's catalog into
a batch of great, fan-recognizable bars — playable in both classic
(guess-the-artist) and finishing-lines (cloze) mode.

## Input
`$ARGUMENTS` — the artist name, optionally with `--songs N` (default 30) and
`--target N` (how many bars to ship, default ~25).

Requires `PQUIZ_ADMIN_TOKEN` (and optionally `PQUIZ_BASE_URL`, Genius creds) in
the env / `apps/web/.env`. If the admin token is missing, stop and say so.

## Pipeline

### 1. Fetch lyrics (skip if already cached)
```bash
pnpm lyrics:fetch --artist "<name>" --songs 30
```
Pulls top songs + lyrics from Genius into `scripts/lyrics/data/<slug>/`.

**Posse-cut-heavy artists:** some artists' top Genius hits are mostly remixes /
cyphers where their own verse isn't the one extracted (Haftbefehl is the classic
case). If step 3 surfaces very few `solo`/`host` couplets, re-fetch deeper to
reach their solo tracks:
```bash
pnpm lyrics:fetch --artist "<name>" --songs 35 --force && pnpm lyrics:extract --artist "<name>"
```

### 2. Extract couplet candidates
```bash
pnpm lyrics:extract --artist "<name>"
```
Writes `scripts/lyrics/data/<slug>/candidates.json` — rhyme-aware couplets with
context, sorted strongest-first, with empty curation fields.

### 3. Curate (this is the real work — you do it)
List the candidates with their **attribution class** (see below) and pick from
the attributable ones:
```bash
pnpm lyrics:pick --artist "<name>" --list --attributable-only
```
This prints a JSON array (song, section, attribution, rhymeScore, couplet,
context). Read it, choose your bars, then apply them with a picks file — the
helper derives the cloze blank from the real couplet text (no transcription
errors) and refuses feature/joint verses:
```bash
cat > /tmp/picks.json <<'JSON'
[
  { "needle": "Deutschraps Miroslav Klose", "solution": "Klose",
    "perfectSolution": ["Klose","Miroslav Klose"],
    "distractor1": "Luciano", "distractor2": "Ufo361" }
]
JSON
pnpm lyrics:pick --artist "<name>" --picks /tmp/picks.json
```

Per pick:
- `needle` — a unique substring of the couplet (locates it).
- `solution` — the payoff word(s) to blank. The helper blanks the *last*
  occurrence in the couplet. Omit `solution` (and `clozePrompt`) to ship the bar
  classic-only.
- `perfectSolution` — accepted answers incl. obvious variants (`["Maus","die
  Maus"]`); defaults to `[solution]`. Matching is case/diacritic/article-lenient.
- `distractor1` / `distractor2` — **peer artist names**, same scene/era/style,
  the kind that make a knowledgeable fan hesitate. Never the correct artist; the
  two must differ. Well-known peers > obscure.
- `clozePrompt` — optional explicit override if you want the blank somewhere
  other than the last occurrence of `solution`.
- `artist` — optional per-bar override; the *only* way to pick a feature/joint
  verse (set it to the real verse author).

Aim for the `--target` count, spread across songs (≤3–4 per song).

#### Attribution — get this right (it's correctness, not taste)
The game asks "who said this?", so a bar must be credited to whoever actually
rapped it. `--list` tags each couplet by its section label:
- **`solo`** (`part_2:_<artist>`) and **`host`** (plain `part_N`) → attributable
  to this artist. **Pick from these.**
- **`feature`** (`part_3:_<someone_else>`) → another rapper's verse. **Skip** (or
  set `artist` to that rapper if you want to add it under them).
- **`joint`** (`part_4:_<artist>_&_<other>`) → shared verse, ambiguous. **Skip.**

`host` is reliable on an artist's own songs but can mislead on remixes/cyphers —
sanity-check those against the `context`. `pick.ts` enforces this: it refuses a
`feature`/`joint` pick unless you set `artist`.

**Quality bar** (from punchline-data.md + CLAUDE.md):
- Iconic & quotable over technically clever. Lines fans rap along to.
- Distinctive to this artist, not generic bars.
- Fair difficulty: not trivial, not obscure-deep-cut.
- 1–2 lines. No hooks/choruses.
- **Never filter on content.** Slurs, violence, vulgarity, misogyny etc. are core
  to the culture and exactly what fans recognize — select on punchline quality
  only, never skip a bar for being "offensive."
- Verify the couplet boundary is a real setup→payoff pair; discard crossings.

When unsure about a song/album/year, a quick WebSearch on the line is fine.

### 4. Insert
Dry-run first to eyeball distractors + cloze:
```bash
pnpm lyrics:insert --artist "<name>" --dry-run
```
Then ship (only `pick: true` rows are sent; each gets POST + cloze PATCH).
Bars land **unreviewed** so they show up in `/admin/review` for a final human
pass — that queue is the QC gate. Pass `--mark-reviewed` only if you want to
skip the queue.
```bash
pnpm lyrics:insert --artist "<name>"
```

## Report
Summarize: bars shipped, how many with cloze authored, duplicates skipped,
errors. Keep it to a few lines.

## Fallback
For a fast, no-judgment pass (classic-only, heuristic distractors) you can use
`pnpm lyrics:auto-curate --artist "<name>"` instead of step 3 — but the hand
curation above is the point of this command.
