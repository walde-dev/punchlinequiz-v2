---
title: "Empty / anonymous state hero art"
status: idea
priority: p3
created: 2026-05-28
updated: 2026-05-28
tags: [design, conversion, art]
depends: [p3-rank-badges]
blocks: []
---

## what

A single larger hero illustration (~200–280px) for the moments where the
app has nothing to show but everything to promise: the anonymous `/profile`
sign-in pitch, and the "no daily today" empty state. Something aspirational
that says "this is the thing you don't have yet."

## why

Both surfaces are conversion moments wrapped as empty states:
- Anonymous `/profile` is where curious players land after tapping the
  header chip — they need a reason to sign up, not just a "please sign in".
- The no-daily state is where users land if they hit `/daily` on a day with
  no challenge scheduled, or follow an old share link.

Today both are text + CTA on dark background. Adding a single hero image —
a glowing locked rank badge, or a podium silhouette — turns the empty state
from "nothing here" into "earn this." Same aspirational physics as a paywall.

## acceptance criteria

- [ ] `apps/web/public/empty-hero.png` (1024×1024 source, transparent or pure-black)
- [ ] Anonymous `/profile` (`AnonymousPitch` in `apps/web/src/routes/profile.tsx`) renders the hero above the headline
- [ ] "No daily today" state (`NoDailyState` in `apps/web/src/routes/daily.tsx`) renders the same hero
- [ ] `mix-blend-mode: screen` + radial mask treatment matches the sign-in banner pattern
- [ ] Pulsing inner glow on the hero — keyframes that loop subtly (`opacity: 0.85 ↔ 1`, 3s, `ease-in-out`)
- [ ] Hero scales responsively (~clamp 180px → 280px) so it doesn't dominate small screens
- [ ] `prefers-reduced-motion` disables the pulse loop
- [ ] Total payload ≤ 200KB

## technical notes

- One hero, two surfaces — keeps the visual story consistent ("here's what
  you're missing") and saves an art slot.
- The pulse loop is the only animation in the app that *loops* (rest are
  one-shot). Keep it gentle: opacity only, no transform, ≤ 30% intensity
  swing, ≥ 3s period, so it doesn't become a flicker.
- Don't repeat the rank badges' visual language exactly — this is a *single*
  bigger hero, not the level-1 badge zoomed in. Should feel like the
  ceremonial cousin.

## prompt (gpt-image-1)

```
A stylized 3D hero illustration: a tall stepped podium (three rising steps
from front to back, like a championship podium) topped with a glowing five-
point gold crown floating just above the highest step. The whole composition
is rendered in glossy amber-gold (#fbbf24) with darker gold (#b45309)
shading on the right and undersides, and a strong warm inner glow
emanating from the crown.

Style: stylized 3D game UI hero illustration, NOT photorealistic. Think
ceremonial mobile-game victory screen art — like the "achievement unlocked"
or "season reward" screens in modern competitive games. Aspirational,
triumphant, but minimal and geometric. Bold silhouette readable at 200px.
Slight bottom shadow grounding the podium.

Pure black background (#000000), perfectly centered, generous black space
around the composition (the hero should occupy roughly the central 60% of
the frame). No text, no numbers, no logos, no people, no trophies, no
laurel wreath.

Aspect ratio: 1:1
```

## references

- apps/web/src/routes/profile.tsx (AnonymousPitch)
- apps/web/src/routes/daily.tsx (NoDailyState)
- p3-rank-badges.md
