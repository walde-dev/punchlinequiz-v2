# Punchline Data — Seeding Guide

## How Punchlines Work

Each punchline is a German rap lyric with key words removed. The user has to guess the missing words.

### Example

**Displayed to user:**
```
Ich bin der _____ und du bist nur ein _____
Ich fahr _____ und du fährst Fahrrad, Digga
```

**Solution:**
```
Ich bin der Boss und du bist nur ein Kleiner
Ich fahr Porsche und du fährst Fahrrad, Digga
```

### Data Fields

- `line` — The punchline text with blanks (use `_____` or just remove the words)
- `perfect_solution` — The exact missing words, in order
- `acceptable_solutions` — JSON array of alternative answers (e.g., different spellings, abbreviations)
- `song_id` — Link to the song

## Where to Get Punchlines

### Manual Seeding
- Go through your favorite albums/songs
- Pick punchlines that are recognizable to fans
- Focus on lines that are quotable, not just technically good
- 20-30 punchlines per artist is a good starting set

### Artists to Start With

Priority (based on German hip hop popularity + fan engagement):

1. **Kollegah** — massive fanbase, quotable bars, competitive fans
2. **Haftbefehl** — iconic lines, Frankfurt scene
3. **Bushido** — legendary, older fanbase
4. **Apache 207** — mainstream appeal, younger audience
5. **RAF Camora** — huge streaming numbers
6. **Bonez MC** — 187 Strassenbande, massive following
7. **SSIO** — cult following, meme-worthy lines
8. **OG Keemo** — critical acclaim, newer generation
9. **Trettmann** — unique style, crossover appeal
10. **Luciano** — mainstream, drill/trap fans

### Quality Criteria

Good punchlines are:
- **Recognizable** — fans should think "oh I know this!"
- **Quotable** — the kind of line people rap along to
- **Distinctive** — not generic bars, but lines unique to that artist
- **Fair difficulty** — not too easy (common words), not too hard (obscure tracks)

Bad punchlines:
- Too obscure (only hardcore fans would know)
- Too generic (could be from any artist)
- Too long (keep to 1-4 lines max)
- Offensive content (keep it competitive, not hateful)

## Data Format for Seeding

### JSON Structure

```json
{
  "artists": [
    {
      "id": "kollegah",
      "name": "Kollegah",
      "image": "https://...",
      "songs": [
        {
          "id": "kollegah-kaisernovember",
          "name": "Kaiser November",
          "album_name": "Zuhältertape Vol. 4",
          "album_image": "https://...",
          "punchlines": [
            {
              "line": "Ich bin der Kaiser November, der _____ zerstört",
              "perfect_solution": "Gegner",
              "acceptable_solutions": ["gegner", "Feinde"]
            }
          ]
        }
      ]
    }
  ]
}
```

### Seeding Script

A simple script to read the JSON and insert into the database. Or use Drizzle's seed script.

## Scaling Punchlines

### Community Submissions (Post-MVP)
- "Schlag eine Punchline vor" form
- Users submit: artist, song, punchline, solution
- Admin reviews before adding to rotation
- Quality control is essential — bad punchlines kill the experience

### AI-Assisted Seeding
- Use AI to generate candidate punchlines from lyrics
- Human review required for quality
- Can speed up initial data collection significantly

## Album Art

For v2, don't rely on Spotify API (adds complexity). Options:
1. **Static URLs** — hardcode album art URLs in the seed data
2. **Placeholder images** — use artist images instead of album art
3. **CDN** — upload images to a CDN and reference them

Spotify album art URLs are stable and can be used directly if you have them from v1.
