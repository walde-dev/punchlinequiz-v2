# Golden set — WHO DAT?! extraction accuracy (PUN-170)

Hand-labeled ground truth for `pnpm ingest:eval`. Each `<videoId>.json`:

```json
{
  "videoId": "NI7V8j3CCZM",
  "title": "…",
  "items": [
    { "line": "full punchline\nwith line breaks", "options": ["Correct", "Distractor1", "Distractor2"], "correct": "Correct", "songTitle": "Song" }
  ]
}
```

`ingest:eval` runs the extraction pipeline on each fixture's video and reports
field-level accuracy (correct answer / line / options / song) + recall, with a
pass/fail against the gate in `config.ts` (`ACCURACY_TARGETS`).

## How to add an episode

1. `pnpm ingest:one <videoId>` (dry-run) to see the extracted items.
2. **Watch the episode** and transcribe each item by hand: full punchline, the 3
   options as shown, the green (correct) answer, and the reveal's song title.
   Do NOT just copy the pipeline output — that makes the measurement circular.
3. Save as `golden/<videoId>.json`.

## Status

- `NI7V8j3CCZM.json` — **seed**, 8 of ~10 items. Machine-extracted then
  spot-verified against reveal frames; **not yet fully independently
  hand-labeled**, and 2 items whose reveal frame wasn't captured are omitted.
  Treat as provisional until a human verifies all items.
- Target: **3 fully hand-labeled episodes** before trusting the gate at volume.
