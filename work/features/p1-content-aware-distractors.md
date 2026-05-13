---
title: "Content-aware distractor matching"
status: scoped
priority: p1
created: 2026-05-14
updated: 2026-05-14
tags: [gameplay, data, quality]
depends: []
blocks: []
---

## problem

Current `pickDistractors()` is a dumb random function:
- Small scene pools (3-5 artists) → limited variety, same pairs repeat
- No memory of what's been used → Haftbefehl always gets Kollegah + SSIO
- Artists forced into one scene (SSIO in both "rap-hard" AND "street-frankfurt")
- Content-blind — a Frankfurt street bar gets the same distractors as a Kollegah wordplay bar
- Some artists (Apache 207) don't fit any scene cleanly

Result: distractors feel repetitive and sometimes nonsensical.

## solution

Two-layer system: **expanded scene tags** (static, per-artist) + **content-aware matching** (dynamic, per-punchline).

```
┌──────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│ scene tags       │     │ content analysis    │     │ distractor       │
│ (per artist)     │ ──► │ (per punchline)     │ ──► │ selection        │
│ multi-membership │     │ keyword + style     │     │ weighted + varied│
└──────────────────┘     └────────────────────┘     └──────────────────┘
```

## part 1: expanded scene tag system

### design

Artists have **multiple scene tags with weights**. Not one scene — many.

```typescript
export const ARTIST_TAGS: Record<string, ArtistTag[]> = {
  "Kollegah": [
    { tag: "hessen", weight: 0.6 },
    { tag: "wordplay", weight: 1.0 },
    { tag: "braggadocio", weight: 0.9 },
    { tag: "old-school", weight: 0.7 },
    { tag: "hard", weight: 0.8 },
    { tag: "battle", weight: 0.9 },
  ],
  "Haftbefehl": [
    { tag: "frankfurt", weight: 1.0 },
    { tag: "street", weight: 1.0 },
    { tag: "multicultural", weight: 0.9 },
    { tag: "hard", weight: 0.8 },
    { tag: "slang", weight: 1.0 },
  ],
  "Apache 207": [
    { tag: "melodic", weight: 0.9 },
    { tag: "mainstream", weight: 1.0 },
    { tag: "love", weight: 0.7 },
    { tag: "pop-rap", weight: 0.8 },
  ],
  // ... etc
}
```

### tag categories

| category | tags | purpose |
|---|---|---|
| **city/region** | frankfurt, berlin, köln, hamburg, münchen, österreich | geographic identity |
| **style** | wordplay, street, melodic, trap, drill, old-school, battle | rap style |
| **mood** | braggadicio, love, introspective, hard, funny, conscious | lyrical tone |
| **era** | old-school (2000s), golden (2010s), new-wave (2020+) | time period |
| **language** | slang, multilingual, standard, dialect | linguistic style |

### matching logic

```typescript
function tagOverlap(a: string, b: string): number {
  const tagsA = ARTIST_TAGS[a] ?? []
  const tagsB = ARTIST_TAGS[b] ?? []
  let score = 0
  for (const ta of tagsA) {
    for (const tb of tagsB) {
      if (ta.tag === tb.tag) {
        score += ta.weight * tb.weight
      }
    }
  }
  return score
}
```

Two artists are good distractors for each other if they share tags with high weight. Haftbefehl vs SSIO: both "frankfurt" + "street" + "hard" → high overlap. Kollegah vs Haftbefehl: share "hard" but different cities → medium overlap. Kollegah vs Apache 207: near-zero overlap → bad distractors.

## part 2: content-aware matching

### per-punchline analysis

Before picking distractors, analyze the punchline text for signals:

```typescript
type ContentSignal = {
  type: "city" | "style" | "mood" | "keyword"
  value: string
  confidence: number
}

function analyzePunchline(line: string, song: string, artist: string): ContentSignal[] {
  const signals: ContentSignal[] = []
  const text = (line + " " + song).toLowerCase()

  // City detection
  if (/frankfurt|069|azzlack|bornheim/.test(text)) signals.push({ type: "city", value: "frankfurt", confidence: 0.9 })
  if (/berlin|berghain|neukölln|kreuzberg/.test(text)) signals.push({ type: "city", value: "berlin", confidence: 0.9 })
  if (/wien|vienna|österreich/.test(text)) signals.push({ type: "city", value: "österreich", confidence: 0.9 })

  // Style detection
  if (/wie |als ob|gleich wie/.test(text)) signals.push({ type: "style", value: "wordplay", confidence: 0.6 })
  if (/baby|love|herz|kuss|liebe/.test(text)) signals.push({ type: "style", value: "love", confidence: 0.7 })
  if (/kokain|drogen|straße|block|deal/.test(text)) signals.push({ type: "style", value: "street", confidence: 0.7 })
  if (/money|cash|gold|lamborghini|porsche|rolex/.test(text)) signals.push({ type: "style", value: "braggadocio", confidence: 0.6 })

  return signals
}
```

### combined scoring

```typescript
function scoreDistractor(
  candidate: string,
  correctArtist: string,
  signals: ContentSignal[],
): number {
  // Base: tag overlap with correct artist
  let score = tagOverlap(candidate, correctArtist)

  // Boost: if candidate shares signal tags
  for (const signal of signals) {
    const candidateTags = ARTIST_TAGS[candidate] ?? []
    for (const tag of candidateTags) {
      if (tag.tag === signal.value) {
        score += tag.weight * signal.confidence
      }
    }
  }

  // Penalty: if candidate was used recently for this artist
  // (tracked in a session-level used pairs set)
  // ...

  return score
}
```

### selection algorithm

```typescript
function pickDistractors(
  correctArtist: string,
  punchline: string,
  song: string,
  usedPairs: Set<string>,
): [string, string] {
  const signals = analyzePunchline(punchline, song, correctArtist)

  // Score all candidates
  const candidates = ALL_ARTISTS
    .filter(a => a !== correctArtist)
    .map(a => ({
      artist: a,
      score: scoreDistractor(a, correctArtist, signals),
      used: usedPairs.has(`${correctArtist}|${a}`),
    }))
    .sort((a, b) => {
      // Prefer unused, then higher score
      if (a.used !== b.used) return a.used ? 1 : -1
      return b.score - a.score
    })

  // Pick top 2
  return [candidates[0]!.artist, candidates[1]!.artist]
}
```

## part 3: variety tracking

### problem
Even with good scoring, Kollegah will always get Haftbefehl + SSIO if they score highest.

### solution: used-pair tracking

```typescript
// In insert.ts, track pairs used per artist in this session
const usedPairs = new Set<string>()

for (const bar of curated) {
  const [d1, d2] = pickDistractors(bar.artist, bar.lines, bar.song, usedPairs)
  usedPairs.add(`${bar.artist}|${d1}`)
  usedPairs.add(`${bar.artist}|${d2}`)
  usedPairs.add(`${bar.artist}|${d1}|${d2}`) // track exact pair too
  // ... insert
}
```

When a pair has been used, the scoring penalizes it, pushing selection to the next-best candidates. Over 20 lines, Kollegah gets 8-10 different distractor combinations instead of 1.

### pair rotation budget

```typescript
// For N punchlines from one artist, aim for at least N/3 unique pairs
const MIN_UNIQUE_PAIRS = Math.ceil(punchlineCount / 3)
```

## part 4: curate-time override

Even with smart matching, the user knows best. During `lyrics:curate`, show assigned distractors and allow override:

```
── Kaiseraura (King, 2014)
  ✓  1. [8.2] Ich hab Nerven wie Drahtseile, ihr habt Nerven wie Zahnseide
     → distractors: Farid Bang, Bushido
  ✓  2. [7.5] Ja, ich würd auch gern mal voller Deepness über Probleme rappen – doch ich hab keine
     → distractors: Farid Bang, Bushido

pick: 1 2
override distractors? [enter to keep, or: d1=<name> d2=<name>]
```

Store distractors in `curated.json`:
```json
{
  "songId": 123,
  "song": "Kaiseraura",
  "lines": "Ich hab Nerven wie Drahtseile...",
  "distractor1": "Haftbefehl",
  "distractor2": "SSIO"
}
```

`insert.ts` reads from file instead of calling `pickDistractors()`.

## implementation order

1. **Expand ARTIST_TAGS** in config.ts — multi-tag with weights for all 10+ artists
2. **Add `analyzePunchline()`** — keyword/signal extraction from line text
3. **Rewrite `pickDistractors()`** — weighted scoring with signal boosting
4. **Add used-pair tracking** in insert.ts
5. **Patch curate.ts** — show distractors, allow override, save to curated.json
6. **Patch insert.ts** — read distractors from curated.json

## files to modify

- `scripts/lyrics/config.ts` — ARTIST_TAGS, analyzePunchline, new pickDistractors
- `scripts/lyrics/curate.ts` — show + override distractors
- `scripts/lyrics/insert.ts` — read from curated.json, used-pair tracking

## success criteria

- [ ] No artist gets the same distractor pair more than 2x in a row
- [ ] Frankfurt lines get Frankfurt distractors
- [ ] Melodic/love lines get melodic artist distractors
- [ ] Street lines get street artist distractors
- [ ] User can override distractors during curation
- [ ] Distractors stored in curated.json, insert reads from file
