---
title: "XP / progression system"
status: idea
priority: p3
created: 2026-05-13
updated: 2026-05-13
tags: [retention, gamification]
depends: []
blocks: []
---

## what

XP earned per correct answer. Streaks multiply XP. Levels / ranks with hip hop themed names.
Visual progression that makes users feel like they're building something.

## why

Retention polish. Gives long-term motivation beyond individual rounds.
Doesn't drive acquisition — ship after the first wave proves the core loop.

## acceptance criteria

- [ ] XP awarded per correct answer (base + streak bonus)
- [ ] Level system with themed ranks (e.g., "Neuling" → "OG")
- [ ] XP bar visible during play
- [ ] Level-up animation on milestone
- [ ] Stats page shows total XP, level, history
- [ ] Stored in localStorage (no auth required)

## technical notes

- XP formula: base 100 + (streak × 25)
- Levels: exponential curve, ~10 levels to start
- Rank names: German hip hop themed
- localStorage key: `pquiz_xp`

## references

- docs/v2-spec.md — score tracking section
