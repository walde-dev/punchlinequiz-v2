---
title: "More game modes"
status: idea
priority: p3
created: 2026-05-13
updated: 2026-05-13
tags: [gameplay, retention]
depends: []
blocks: []
---

## what

Additional quiz modes beyond "guess the artist":
- Fill-in-the-blank (type the missing word)
- Speed round (timed, 10 seconds per bar)
- Multiplayer / group race (send link, race to answer)
- "Finish the bar" (complete the next line)

## why

Variety keeps the product fresh after the core loop is proven.
Ship after core modes are validated with real users.

## acceptance criteria

- [ ] TBD — scope after first user feedback wave

## technical notes

- Fill-in-the-blank needs different punchline format (words with blanks)
- Speed round: client-side timer, server validates after
- Multiplayer: WebSockets or polling, significant infra lift
- Defer multiplayer until 100+ DAU proves demand

## references

- docs/v2-spec.md — post-MVP section
