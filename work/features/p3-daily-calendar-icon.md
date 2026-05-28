---
title: "Daily challenge calendar icon"
status: idea
priority: p3
created: 2026-05-28
updated: 2026-05-28
tags: [design, art]
depends: []
blocks: []
---

## what

A single 3D stylized gold calendar-page icon for the daily banner on the
home page. Sits to the left of the "Eine Bar. Ein Versuch." headline. Sells
the "fresh every day" promise visually before the user reads the copy.

## why

The daily banner on the home page is one of the highest-conversion CTAs in
the app (it pulls users into a one-shot, repeat-visit game loop). It's
currently a gold-bordered box with an eyebrow + headline + arrow. The
information is there; the emotional pull isn't. A small calendar icon — the
universal "today" symbol — adds a visual anchor and matches the icon-led
treatment of the sign-in banner sitting right below it.

## acceptance criteria

- [ ] `apps/web/public/daily-icon.png` (1024×1024 source, transparent or pure-black)
- [ ] `DailyBanner` in `apps/web/src/routes/index.tsx` renders the icon on the left of the text block on screens ≥ sm
- [ ] Optionally shows the day-number (today's date) as a separate overlay element rendered in CSS — not baked into the image, so it's always current
- [ ] `mix-blend-mode: screen` if PNG ships black-backgrounded
- [ ] Subtle gold drop-shadow glow ties it to the existing primary border
- [ ] Hover state: micro-tilt (~3deg) on the icon, `cubic-bezier(0.16, 1, 0.3, 1)` 200ms
- [ ] `prefers-reduced-motion` disables the hover tilt

## technical notes

- The CSS-overlay date trick: position a small `<span>` absolutely on top of
  the icon showing the current day (e.g., "28"), styled to match. Keeps the
  image static while the banner always looks current.
- Keep total icon payload ≤ 80KB.

## prompt (gpt-image-1)

```
A stylized 3D game UI icon: a single calendar page tear-off, oriented
front-facing, square with rounded corners and a subtle binder ring at the
top. Rendered in glossy amber-gold (#fbbf24) with darker gold (#b45309)
shading along the bottom edge and right side for depth. The face of the
calendar page is mostly empty/clean (no date number — that's overlaid in
CSS), with a single horizontal dividing line near the top suggesting the
header strip.

Style: stylized 3D game UI icon, NOT photorealistic. Bold geometric
silhouette readable at 64px. Soft warm inner glow. Think modern mobile
app icon, premium and tactile.

Pure black background (#000000), perfectly centered, generous black space
around the calendar. No text, no numbers, no logos, no people. Square
composition, symmetric.

Aspect ratio: 1:1
```

## references

- apps/web/src/routes/index.tsx (DailyBanner component)
- apps/web/src/components/sign-in-banner.tsx (image treatment pattern)
