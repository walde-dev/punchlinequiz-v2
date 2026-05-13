---
title: "Artist selection mode"
status: scoped
priority: p1
created: 2026-05-13
updated: 2026-05-13
tags: [distribution, gameplay, core]
depends: []
blocks: []
---

## what

Let users pick an artist before playing. Each artist = separate quiz experience.
URL structure: `/play?artist=kollegah` or `/play?artist=haftbefehl`

## why

Enables targeted community posting. Post Kollegah quiz in Kollegah fan communities.
10 artists = 10 community posts = 10x distribution surface.

## acceptance criteria

- [ ] Landing page shows artist grid (image + name)
- [ ] Clicking artist starts quiz filtered to that artist
- [ ] "Alle" option for random across all artists
- [ ] URL reflects artist filter (deep-linkable, shareable)
- [ ] Artist avatar shown in header during play
- [ ] Empty state if artist has < 3 punchlines (need 3 for choices)
- [ ] Artist grid works on mobile (horizontal scroll or 2-col grid)

## technical notes

- Server function `getRound` already accepts filtering — extend with artistId
- Need at least 3 artists with 10+ punchlines each for meaningful launch
- Artist images from DB `imageUrl` field
- Consider "Alle" as default with artist as optional param

## references

- docs/distribution.md — artist-specific distribution strategy
- docs/v2-spec.md — artist mode spec
