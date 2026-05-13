---
title: "Seed initial punchlines (200+)"
status: in_progress
priority: p0
created: 2026-05-13
updated: 2026-05-13
tags: [data, content, launch-blocking]
depends: []
blocks: []
---

## what

Seed the database with 200+ punchlines across 10+ artists for launch.

## status

- 122 lines in seed.json (82 verified, 40 needs-review)
- Kollegah: 35 ✓ verified (songtexte.com)
- Haftbefehl: 15 ✓ verified (musixmatch scraped)
- Bushido: 10 ✓ verified (musixmatch scraped)
- Sido: 8 ✓ verified (musixmatch scraped)
- Apache 207: 7 ✓ verified (musixmatch scraped)
- RAF Camora: 7 ✓ verified (musixmatch scraped)
- Bonez MC: 8 ? needs review
- SSIO: 8 ? needs review
- OG Keemo: 8 ? needs review
- Capital Bra: 8 ? needs review
- Luciano: 8 ? needs review

## blocking issue

Lyrics sites actively block scraping:
- genius.com = Cloudflare captcha
- musixmatch = rate limits after ~15 requests
- songtexte.com = limited coverage

## next steps

- [ ] Walde to review "needs-review" lines (40 total)
- [ ] Walde to add more lines manually for under-represented artists
- [ ] Deploy v2 to get working API endpoint
- [ ] Run batch-insert.py against live API
- [ ] Target: 200+ lines, 10+ artists, 15+ per artist minimum

## files

- `seed-research/seed.json` — master seed file
- `seed-research/batch-insert.py` — batch insert script
- `seed-research/kollegah.json` — kollegah-specific verified data
- `seed-research/raw_lyrics.json` — raw scraped lyrics
