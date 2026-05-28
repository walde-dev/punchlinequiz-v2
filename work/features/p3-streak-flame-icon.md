---
title: "Custom streak flame icon"
status: idea
priority: p3
created: 2026-05-28
updated: 2026-05-28
tags: [design, gamification, art]
depends: [p3-xp-system]
blocks: []
---

## what

Replace the 🔥 emoji used as the streak indicator with a custom 3D stylized
gold flame. Used in the header XP chip, profile stat tiles, XP-gain chip on
correct answers, and the level-up modal.

## why

The 🔥 emoji renders inconsistently across OSes (Apple's looks great, Windows
looks flat, older Android looks cartoonish). Every other gold accent in the
UI is tightly controlled — the streak symbol shouldn't be the only thing
breaking that. A single custom flame icon gives us cross-platform consistency
and ties streaks into the same visual language as rank badges and mode art.

## acceptance criteria

- [ ] `apps/web/public/streak-flame.svg` (preferred — single inlinable file) OR `.png` at 256×256
- [ ] All four usages swap the emoji for the icon, sized via CSS:
  - `XpHeaderChip` (16×16, alongside streak number)
  - `/profile` stats tile "Aktuelle Streak" (24×24)
  - `XpGain` streak chip on multi-correct (14×14)
  - `LevelUpModal` (optional, if streak is part of the level-up message)
- [ ] Color respects the gold accent token — if SVG, use `fill="currentColor"` so it inherits `text-primary`
- [ ] Pulse animation on streak increment uses `cubic-bezier(0.4, 0, 0.6, 1)` 0.6s (already on the chip)
- [ ] `prefers-reduced-motion` disables the pulse
- [ ] Backward compatible: the emoji fallback stays as `alt` text for screen readers and copy-paste from share text

## technical notes

- **Strong preference for SVG**: scales perfectly, inherits color, no payload
  cost. Generate the PNG via gpt-image-1, then trace to SVG manually or with
  a quick vectorize pass.
- If SVG isn't feasible, ship the PNG with `mix-blend-mode: screen` (same
  pattern as the chains banner) since the rest of the UI is dark.
- Don't touch the share-card text — emoji is fine in plain text share output
  (Twitter, WhatsApp).

## prompt (gpt-image-1, source for the vector trace)

```
A stylized 3D game UI icon: a single bold flame shape with two or three
licks/curves, simple geometric silhouette. Rendered in glossy amber-gold
(#fbbf24) with darker amber (#b45309) shading at the base of the flame and
a brighter highlight along the leading edge. Subtle warm inner glow.

Style: stylized 3D game icon, NOT photorealistic, NOT realistic fire. Think
the Duolingo streak flame energy but in pure gold instead of orange. Bold
geometric silhouette readable at 16px. Flat shading with smooth gradients.

Pure black background (#000000), perfectly centered, generous black space
around the flame. No text, no smoke, no embers, no other elements. Square
composition, symmetric vertical axis.

Aspect ratio: 1:1
```

## references

- apps/web/src/components/xp-header-chip.tsx
- apps/web/src/components/xp-gain.tsx
- apps/web/src/routes/profile.tsx
