---
title: "Genius-powered lyric sourcing pipeline"
status: scoped
priority: p0
created: 2026-05-13
updated: 2026-05-13
tags: [data, content, tooling, automation]
depends: []
blocks: ["work/features/p0-seed-punchlines.md"]
---

## problem

AI-generated lyrics are hallucinated garbage. Manual entry is accurate but 30 min per artist. Need a middle ground: real lyrics from a verified source, human picks the good punchlines.

## solution

Genius.com API → fetch real lyrics for specific songs → extract candidate bars → human curates.

**AI handles sourcing. Human handles taste. No AI in the lyrics loop.**

## architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│ genius API  │ ──► │ fetch lyrics │ ──► │ extract bars │ ──► │ human    │
│ (real data) │     │ for songs    │     │ candidates   │     │ curates  │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────┘
                                                                   │
                                                                   ▼
                                                            ┌──────────┐
                                                            │ API      │
                                                            │ insert   │
                                                            └──────────┘
```

## API: genius.com/api

- Base: `https://api.genius.com`
- Auth: Bearer token in header
- Key endpoints:
  - `GET /search?q=Kollegah+Kaiseraura` → returns song IDs + titles
  - `GET /songs/:id` → returns song metadata (no lyrics)
  - Lyrics are NOT in the API response — they live on the web page
  - Need to scrape the song page URL from the API response, then extract lyrics from the HTML (genius uses `<div data-lyrics-container>` tags)

## pipeline steps

### 1. search songs per artist
```
Input: artist name (e.g. "Kollegah")
Output: list of {song_id, title, url, album_art_url}
```
- Search genius for the artist
- Fetch top 30-50 songs
- User can filter/select which songs to process

### 2. fetch lyrics for selected songs
```
Input: song URL from genius
Output: full lyrics text (plain)
```
- Fetch the song page HTML
- Extract lyrics from `data-lyrics-container` divs
- Clean up: remove annotations, stage directions, formatting tags
- Store raw lyrics per song

### 3. extract candidate bars
```
Input: full lyrics text
Output: list of 1-4 line segments
```
- Split into line groups (1-4 lines each)
- Filter: skip hooks/chorus repeats, skip very short lines (< 5 words)
- Skip lines that are too generic (no artist-specific markers)
- Heuristic preference: lines with wordplay, similes ("wie"), punchline structure
- Output: 10-20 candidate bars per song

### 4. human curation (the fast part)
```
Input: candidate bars list
Output: selected bars with song metadata
```
- Display candidates with song name, album, year
- User picks which bars are good punchlines
- 5 min per artist instead of 30
- Selected bars go straight to API insert

### 5. insert via admin API
```
Input: curated bars with metadata
Output: punchlines in DB
```
- Use existing `/api/admin/bars` endpoint
- Auto-assign distractors based on scene grouping
- Dedup check built into API

## tech stack

- **Runtime:** Node.js script (fits the monorepo) or Python CLI
- **Genius API:** `https://api.genius.com` + bearer token
- **Lyrics scraping:** fetch song page HTML, parse with regex or cheerio
- **Output:** JSON file per artist with candidate bars
- **Curation:** interactive CLI (prompt-based) or simple web page

## env vars

```
GENIUS_API_TOKEN=...  # from genius.com/api-clients
PQUIZ_ADMIN_TOKEN=... # existing
PQUIZ_BASE_URL=...    # e.g. https://punchlinequiz-v2-web.vercel.app
```

## UX: two modes

### mode 1: CLI pipeline (for batch work)
```bash
# search and fetch lyrics for an artist
pnpm lyrics:fetch --artist "Kollegah" --songs 30

# extract candidates
pnpm lyrics:extract --artist "Kollegah"

# review and select (interactive)
pnpm lyrics:curate --artist "Kollegah"

# insert selected bars
pnpm lyrics:insert --artist "Kollegah"
```

### mode 2: Hermes agent integration
- Agent calls genius API to fetch lyrics
- Agent extracts candidate bars
- Agent presents candidates to user on Telegram
- User picks which ones to keep (reply with numbers)
- Agent inserts via admin API

## output format

```json
{
  "artist": "Kollegah",
  "songs": [
    {
      "title": "Kaiseraura",
      "album": "King",
      "year": 2014,
      "genius_url": "https://genius.com/...",
      "candidates": [
        {
          "lines": "Ich hab Nerven wie Drahtseile, ihr habt Nerven wie Zahnseide",
          "context": "...",  // surrounding lines for context
          "position": "verse_2",
          "selected": false
        }
      ]
    }
  ]
}
```

## artist priority (same as punchline-data.md)

1. Kollegah ✓ (have 35, need more songs)
2. Haftbefehl ✓ (have 15, need more)
3. Bushido ✓ (have 10, need more)
4. Sido ✓ (have 8, need more)
5. Apache 207 ✓ (have 7, need more)
6. RAF Camora ✓ (have 7, need more)
7. Bonez MC ✗ (have 0)
8. SSIO ✗ (have 0)
9. OG Keemo ✗ (have 0)
10. Capital Bra ✗ (have 0)
11. Luciano ✗ (have 0)

## success criteria

- [ ] Fetches real lyrics from genius (not hallucinated)
- [ ] 10-20 candidate bars per song
- [ ] Human can curate 200 lines in ~30 min total (vs hours of manual entry)
- [ ] All inserted lines are real, verified, distinctive
- [ ] Distractors make sense (same-scene artists)

## files to create

- `scripts/lyrics/fetch.ts` — genius API search + lyrics scraping
- `scripts/lyrics/extract.ts` — candidate bar extraction
- `scripts/lyrics/curate.ts` — interactive selection
- `scripts/lyrics/insert.ts` — batch insert via admin API
- `scripts/lyrics/config.ts` — artist list, scene groupings
- `.env.example` — add `GENIUS_API_TOKEN`

## references

- Genius API docs: https://docs.genius.com/
- API client registration: https://genius.com/api-clients
- Existing batch-insert: `seed-research/batch-insert.py`
- Admin API spec: `docs/superpowers/specs/2026-05-13-pquiz-content-api-design.md`
