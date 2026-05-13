---
title: "Daily challenge"
status: idea
priority: p1
created: 2026-05-13
updated: 2026-05-13
tags: [retention, viral, gameplay]
depends: ["work/features/p0-share-cards.md"]
blocks: []
---

## what

One punchline per day, everyone gets the same one. Wordle-style share grid.
"Heute: Apache 207" — one shot, make it count.

## why

Creates daily habit + return visits. Another share surface beyond round completion.
Wordle proved this model works — daily constraint + share = engagement loop.

## acceptance criteria

- [ ] One punchline selected per day (deterministic, same for all users)
- [ ] User gets one attempt — no retries
- [ ] Result shown as colored grid (green/yellow/red blocks, wordle-style)
- [ ] Share button copies emoji grid + link
- [ ] "Come back tomorrow" message after completing
- [ ] Timer showing when next daily unlocks
- [ ] Previous dailys viewable but not playable
- [ ] Works without login

## technical notes

- Deterministic selection: hash of (date + secret) mod punchline count
- Store daily results in localStorage (no server needed)
- Share text format: "punchline/quiz daily #47\n🟩🟩⬛🟩\npunchlinequiz.de"
- Cron or edge function to rotate daily at midnight CET

## references

- docs/distribution.md — daily challenge mention
- docs/v2-spec.md — daily challenge spec
