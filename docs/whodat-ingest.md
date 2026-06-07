# WHO DAT?! YouTube punchline ingestion

Auto-ingests punchlines from splash!'s **"Das Punchline Quiz"** YouTube series
into the existing admin review queue. Ongoing pipeline only (no backlog
backfill). Vision-only extraction (the channel has no captions), human approves
before anything goes live.

Linear: project `cf0763ff` (PUN-140..171). Design rationale + the decisions that
override the original tickets live in the PR's `implementation-notes.html`.

## How it works

```
playlist poll ─▶ download (yt-dlp) ─▶ sample+crop+dedup frames (ffmpeg)
   │                                          │
   ▼                                          ▼
isQuizEpisode filter            Gemini 2.5 Flash extracts each item
   │                            (line, 3 options, green=correct, song credit, X/10)
   ▼                                          │
processed ledger                              ▼
(ingest_episodes)            group frames→items, resolve song/artists (Genius+Deezer)
                                              │
                                              ▼
                        insert punchlines (reviewed=false, active=true)
                        + provenance (ingest_items)  ─▶  /admin/review
```

- **No captions** exist on the channel, so extraction is vision-only; Genius
  title-search (from the on-screen reveal credit) resolves the song.
- The reveal frame is authoritative: green highlight = correct answer; the credit
  ("Artist - Title") gives the song; "X/10" gives the index.
- `song.artistId` is set to the **correct quiz artist** (so the game's answer
  join resolves), not the song's primary credit.
- Bars land `reviewed=false, active=true` → quarantined from every player
  surface until an admin approves in the existing review queue. Low-confidence
  items are inserted but flagged; items with no extracted answer are recorded in
  `ingest_items` (not minted) so nothing is silently dropped.

## Commands

```bash
pnpm ingest:poll              # dry-run: list new episodes + preview (no DB writes)
pnpm ingest:poll --commit     # process all new episodes into the review queue
pnpm ingest:poll --commit --limit 1
pnpm ingest:one <videoId>     # (re)process one episode, dry-run
pnpm ingest:one <videoId> --commit
pnpm ingest:eval              # accuracy harness vs the golden set (no DB)
```

## Prerequisites

- `ffmpeg` (`brew install ffmpeg`) and `yt-dlp` (`brew install yt-dlp` or
  `pipx install yt-dlp`; the CLI also accepts `python3 -m yt_dlp`).
- `.env`: `GEMINI_API_KEY` (new), plus existing `DATABASE_URL`,
  `GENIUS_ACCESS_TOKEN`, `AXIOM_TOKEN`, `AXIOM_DATASET`.
- Run the DB migration: `cd packages/db && pnpm db:migrate`.

## Scheduling (PUN-166)

- **Local (default):** `scripts/ingest/scheduling/com.punchlinequiz.whodat-ingest.plist`
  — a launchd job that runs `ingest:poll --commit` daily. Only polls while the
  Mac is awake (acceptable for non-urgent content).
- **Always-on (optional):** `scripts/ingest/scheduling/ci-ingest.yml.disabled` —
  a GitHub Actions scheduled workflow, **disabled by default**. Note: YouTube may
  403 datacenter IPs; cookies may be required on cloud runners.

## Tuning

Frame segmentation and the accuracy gate are env-tunable; see `scripts/ingest/config.ts`
and `frames.ts` (`INGEST_MIN_STATIC`, `INGEST_STATIC_T`, `INGEST_DEDUP_MAD`,
`INGEST_CLUSTER_SIM`). Measure changes with `pnpm ingest:eval` against the golden
set (`scripts/ingest/golden/`).

## Logging

Structured events go to Axiom (`run_id`, `video_id`, timestamps):
`ingest_run_started`, `episode_processing_started`, `episode_extracted`,
`item_extracted` / `item_skipped_duplicate` / `item_failed`, `episode_processed`,
`ingest_run_finished`. A `run_id` reconstructs a full run timeline.
