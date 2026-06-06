# LLM-in-the-loop Curation Pipeline

**Date:** 2026-05-28
**Status:** Approved, implementing

## Problem

Adding good, curated punchlines is the biggest bottleneck. The existing
`scripts/lyrics` pipeline (`fetch → extract → curate/auto-curate → insert`)
fails on quality in three ways:

1. **Bar boundaries are wrong.** `extract.ts` slides 1–N line windows through
   verse blocks with no notion of rhyme couplets, so it grabs
   `punchline(couplet1) + setup(couplet2)` as a single "bar."
2. **Bar selection is mediocre.** Regex heuristics surface filler, not the
   iconic lines fans rap along to.
3. **Distractors feel random.** Tag-overlap picks plausible-ish artists but with
   no judgment.

Also: every script-added bar is **classic-only** (guess-the-artist). The richer
**finishing-lines / cloze** mode (`clozePrompt` + `perfectSolution`) is never
authored by the pipeline.

## Approach

Claude Code is the judgment layer — no paid LLM API in the scripts. Scripts
shuttle data in and out; Claude makes every quality call.

```
lyrics:fetch     → Genius lyrics + songs.json        (unchanged)
lyrics:extract   → candidates.json: rhyme-aware couplets + context + empty
                   curation fields                    (rewritten)
[Claude curates] → edits candidates.json in place: pick iconic couplets,
                   choose distractor peers, author cloze blank + solution
lyrics:insert    → POST classic fields, PATCH cloze + reviewed=true (extended)
```

A `/curate-artist <name>` slash command orchestrates the whole loop and encodes
the quality bar (punchline-data.md criteria + CLAUDE.md brand voice).

## Data model recap

- `punchlines.line` — the bar, lines joined by ` / `, each ending ` /`.
- Classic mode: `distractor1Id`, `distractor2Id` → two peer artists.
- Cloze mode: `clozePrompt` (line with `___`) + `perfectSolution` (accepted
  answers, matched article/diacritic/case-lenient). Gated by `clozeEnabled`.
- POST `/api/admin/bars` creates classic bar. PATCH `/api/admin/bars/:id` sets
  cloze fields + `reviewed`.

## candidates.json entry schema

```jsonc
{
  "songId": 123,
  "song": "Kaiser November",
  "album": "Zuhältertape 4",
  "year": 2014,
  "section": "verse_1",
  "couplet": "erste Zeile / zweite Zeile /",
  "context": "vorherige\nerste Zeile\nzweite Zeile\nnächste",
  "rhymeScore": 0.82,
  "heuristicScore": 5,
  // filled by Claude:
  "pick": false,
  "distractor1": "",
  "distractor2": "",
  "clozePrompt": "",        // couplet with ___ ; empty = classic-only
  "perfectSolution": [],    // accepted answers for the blank
  "notes": ""
}
```

## Couplet detection (the core fix)

`scripts/lyrics/rhyme.ts`:
- `rhymeTail(word)` — lowercase, strip non-letters, return substring from the
  last vowel group (a/e/i/o/u/ä/ö/ü/y). German end-rhyme proxy.
- `rhymeScore(lineA, lineB)` — compare last-word tails; 1.0 exact tail match,
  partial credit for suffix overlap ≥2 chars (slant rhyme), 0 otherwise.

`extract.ts` rewrite:
- Split into verse blocks (skip hooks), as today.
- Score every adjacent line pair `(i, i+1)` by `rhymeScore`.
- Keep pairs above a rhyme threshold; when pairs overlap, keep the
  higher-scoring one so we don't emit `punchline+setup` crossings.
- Emit each surviving couplet with context + heuristic score + empty curation
  fields.

## Quality bar (encoded in /curate-artist)

- **Iconic over technical** — lines fans quote, not just clever bars.
- **Fair cloze blank** — blank the punchline word(s), not filler; not guessable
  from rhyme alone, not impossibly obscure. Skip cloze (leave classic-only) when
  no clean blank exists.
- **Distractor peers** — same scene/era/style; make a knowledgeable fan
  hesitate. Never the correct artist; the two must differ.
- **Brand voice** for any copy: competitive, cultural, slick. Gold only.

## Out of scope

- Touching the interactive `curate.ts` / `auto-curate.ts` (left as-is fallback).
- Any change to the game UI or DB schema.
