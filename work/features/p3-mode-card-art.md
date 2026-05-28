---
title: "Mode card hero art (home page)"
status: idea
priority: p3
created: 2026-05-28
updated: 2026-05-28
tags: [design, conversion, art]
depends: []
blocks: []
---

## what

Two stylized 3D gold icons sitting on the left of each mode card on the home
page: a microphone for classic mode, a blank-fill glyph for cloze. ~80×80px
asset slot. Replaces today's text-only mode cards.

## why

The home page is the entry point. Mode cards are currently pure text + arrow —
functional but flat, and indistinguishable at a glance. Hero art on the left
of each card gives each mode a face, makes the choice feel tactile, and ties
the home page into the same game-icon visual language as the rank badges and
sign-in banner.

## acceptance criteria

- [ ] `apps/web/public/modes/mic.png` and `apps/web/public/modes/cloze.png` (1024×1024 source)
- [ ] `ModeCard` in `apps/web/src/routes/index.tsx` renders the icon on the left of the title block on screens ≥ sm; hidden on xs (text-only stays)
- [ ] Icons use `mix-blend-mode: screen` + radial mask (same pattern as the sign-in banner) if the PNG ships with black backdrop; or transparent PNG if generated that way
- [ ] Subtle gold drop-shadow glow tying the icon to the card border
- [ ] No layout shift on load (`width`/`height` attrs set explicitly)
- [ ] Hover state: icon shifts ~4px right alongside the existing arrow animation
- [ ] `prefers-reduced-motion` disables the hover translate

## technical notes

- Keep the cards' `cubic-bezier(0.16, 1, 0.3, 1)` 0.55s stagger; the icon
  animates in with the card, not separately.
- Cap icon container at 80px wide so it doesn't eat the card on small tablets.
- Total payload for both icons should be ≤ 120KB after `pngquant`.

## prompts (gpt-image-1)

### Classic / mic
```
A stylized 3D game UI icon: a chunky vintage hip-hop microphone (ball-head
broadcast mic) tilted slightly to the right, rendered in glossy amber-gold
(#fbbf24) with darker gold (#b45309) shading on the bottom and right edges.
The mic head is a textured sphere with a hint of grille pattern; the handle
is a short cylinder. Soft warm inner glow.

Style: stylized 3D game UI icon, low-poly look with smooth gradients, NOT
photorealistic. Think Clash Royale, modern mobile RPG achievement icon, or
Riot Games product art. Bold geometric silhouette readable at 64px.

Pure black background (#000000), perfectly centered, generous black space
around the icon. No text, no logos, no people, no hands. Square composition.

Aspect ratio: 1:1
```

### Cloze / blank-fill
```
A stylized 3D game UI icon: a flat geometric "blank fill" glyph rendered as
three short horizontal bars stacked vertically with the middle bar replaced
by an empty bracket or underscore shape, suggesting a missing word in a line
of text. Rendered in glossy amber-gold (#fbbf24) with darker gold (#b45309)
shading. Subtle inner glow on the empty slot, as if the missing piece is
waiting to be filled.

Style: stylized 3D game UI icon, low-poly look with smooth gradients, NOT
photorealistic. Bold geometric silhouette readable at 64px. Reads instantly
as "fill in the blank" even at small size.

Pure black background (#000000), perfectly centered, generous black space.
No text, no letters, no logos. Square composition.

Aspect ratio: 1:1
```

## references

- apps/web/src/routes/index.tsx (ModeCard component)
- apps/web/src/components/sign-in-banner.tsx (same mix-blend-mode pattern)
