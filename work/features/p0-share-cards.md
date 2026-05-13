---
title: "Share cards — the viral engine"
status: scoped
priority: p0
created: 2026-05-13
updated: 2026-05-13
tags: [viral, distribution, core]
depends: []
blocks: ["work/features/p1-daily-challenge.md"]
---

## what

After completing a round (10 punchlines), generate a shareable image:
- Score: "8/10 — Kollegah Edition"
- Artist theme if filtered
- Branding: punchlinequiz.de
- CTA: "schaffst du mehr?"

## why

distribution doc says it directly: "the share card is the engine."
without this, every user who finishes a round just closes the tab.
this is the difference between a toy and a growth machine.

## acceptance criteria

- [ ] 1080×1080 image generated client-side (html-to-image or canvas)
- [ ] Shows score, artist name (if filtered), punchlinequiz.de branding
- [ ] Download button (saves as PNG)
- [ ] Copy link button (copies URL with share params)
- [ ] Share to WhatsApp / Instagram / Twitter buttons
- [ ] Mobile-first: buttons thumb-reachable, card preview visible
- [ ] Gold theme matches design-direction.md tokens
- [ ] Works without login (anonymous users can share)

## technical notes

- `html-to-image` or native Canvas API
- Consider OG image params in URL so shared links show preview
- Share URL format: `punchlinequiz.de/play?artist=kollegah`
- Log `share_clicked` event with channel + artist for analytics

## references

- docs/distribution.md — viral loop diagram
- docs/design-direction.md — color tokens, aesthetic rules
- docs/v2-spec.md — share card spec section
