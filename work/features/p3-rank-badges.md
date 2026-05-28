---
title: "Per-level rank badges (10 icons)"
status: idea
priority: p3
created: 2026-05-28
updated: 2026-05-28
tags: [design, gamification, art]
depends: [p3-xp-system]
blocks: []
---

## what

One custom-rendered badge per level (10 total), used across the level-up modal,
the profile hero, the header chip, and the future leaderboard. Badges escalate
in visual richness so a player can see at a glance how far someone has climbed.

## why

Levels are currently text only ("Headnodder", "OG"). A visual rank — the
single most replayed surface in any RPG — is missing. With badges, every
level-up becomes a screenshot moment, the profile feels earned, and the
header chip stops looking like a generic XP bar.

This unlocks three surfaces with one art investment:
- level-up modal (today: text + confetti)
- profile hero (today: gold-glow text only)
- header chip (today: text + bar)
- later: leaderboard rows

## escalation arc

| Lvl | Name (DE / EN) | Badge concept |
|---|---|---|
| 1 | Neuling / Rookie | Single bronze chevron, matte |
| 2 | Hörer / Listener | Double bronze chevron |
| 3 | Mitläufer / Follower | Single silver chevron |
| 4 | Kenner / Connoisseur | Double silver chevron |
| 5 | Headnodder | Triple silver chevron with small star |
| 6 | Reimwächter / Bar Guard | Single gold chevron with star |
| 7 | Lyricist | Double gold chevron with star |
| 8 | Punchliner | Triple gold chevron with crown notch |
| 9 | Veteran | Triple gold chevron with full crown |
| 10 | OG | Ornate gold crown with laurel, sparkle accents |

Visual language: 3D stylized game-rank icon (Valorant / Apex tier energy),
NOT photoreal. Flat shading with subtle gradients, glossy gold/silver/bronze
materials, pure black background, square 1024×1024, transparent or pure-black
backdrop, generous breathing room around the silhouette.

## acceptance criteria

- [ ] 10 badge PNGs at `apps/web/public/ranks/rank-{1..10}.png` (1024×1024)
- [ ] `levels` table grows an optional `iconPath` column (varchar(128)) — seeded with `/ranks/rank-N.png`
- [ ] `LevelInfo` type carries `iconPath`; the `/api/admin/levels` endpoint accepts it on PUT
- [ ] `LevelUpModal` renders the new level's badge above the rank name (3D pop-in with `cubic-bezier(0.16, 1, 0.3, 1)`, 450ms; `mix-blend-mode: screen` if PNGs ship black-backgrounded)
- [ ] `/profile` hero shows the current rank badge to the left of (or above) the level name on mobile
- [ ] `XpHeaderChip` swaps the text-only level name for a 24×24 thumbnail of the badge on screens ≥ sm; keeps text on xs
- [ ] Admin `/admin/levels` form gains an `iconPath` input per row
- [ ] All badges respect `prefers-reduced-motion` — no entrance animation when reduced
- [ ] Lighthouse: total payload for the 10 badges ≤ 600KB after Next/Vite image optimization (or pre-compressed via `pngquant`)

## technical notes

- Storage: keep static under `public/ranks/`. Don't go through Vercel Blob —
  these never change, the CDN cache will be perfect.
- Optimization: run `pngquant --quality=70-90` on each before commit. Target
  ~50–60KB per badge.
- The `iconPath` column is nullable so the system keeps working pre-art.
- The level-up modal is the priority surface — make sure that one ships first
  and the others can land in a follow-up if needed.

## prompt set (gpt-image-1, one per level)

All share the boilerplate:
- "Stylized 3D game rank badge, NOT photorealistic"
- "Front-facing, square composition, perfectly centered"
- "Pure black background (#000000), generous black space around the badge"
- "Flat shading with subtle gradients, glossy material, NOT realistic jewelry"
- "Bold geometric silhouette readable at 64px"
- "No text, no numbers, no logos, no people"

Per-level variation:

1. "single chevron stripe in matte bronze (#a16a3a), simple V-shape pointing up"
2. "two stacked chevron stripes in matte bronze (#a16a3a), small on top of larger"
3. "single chevron stripe in polished silver (#c0c0c0), slightly glossier than bronze"
4. "two stacked chevron stripes in polished silver (#c0c0c0)"
5. "three stacked chevron stripes in polished silver (#c0c0c0) with a small silver five-pointed star floating just above the top chevron"
6. "single chevron stripe in glossy amber-gold (#fbbf24) with a five-pointed gold star floating above; subtle warm glow"
7. "two stacked chevron stripes in glossy amber-gold (#fbbf24) with a gold star above; brighter warm glow"
8. "three stacked chevron stripes in glossy amber-gold (#fbbf24) topped with a small geometric crown notch (three points) in matching gold"
9. "three stacked chevron stripes in glossy amber-gold (#fbbf24) topped with a full five-point crown in matching gold; strong inner glow"
10. "ornate five-point gold crown (#fbbf24) framed by two olive laurel branches in matching gold, small sparkle accents around the crown; the most elaborate and triumphant of the set"

## references

- p3-xp-system.md
- apps/web/src/components/level-up-modal.tsx
- apps/web/src/routes/profile.tsx
- apps/web/src/components/xp-header-chip.tsx
