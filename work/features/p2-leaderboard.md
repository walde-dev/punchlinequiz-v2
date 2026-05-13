---
title: "Leaderboard"
status: scoped
priority: p2
created: 2026-05-13
updated: 2026-05-13
tags: [retention, competitive, gameplay]
depends: []
blocks: []
---

## what

Weekly leaderboard (resets Monday). Top 10 scores displayed.
Login with nickname (no OAuth) for submission only.

## why

Competitive hook that keeps people coming back.
Only matters AFTER share cards exist so losers can challenge friends.

## acceptance criteria

- [ ] Leaderboard page shows top 10 for current week
- [ ] Nickname entry (no password, no email) to submit score
- [ ] Score = correct answers in a single session
- [ ] Weekly reset every Monday 00:00 CET
- [ ] "Dein Score" highlight if user is on the board
- [ ] Mobile-friendly table layout
- [ ] Works without login to VIEW, requires nickname to SUBMIT

## technical notes

- Minimal auth: nickname + localStorage token (no OAuth)
- Server-side score validation (trust client score submission less)
- Consider anti-cheat: rate limit submissions, cap session length
- DB table: `leaderboard_entries` (nickname, score, week, created_at)

## references

- docs/v2-spec.md — leaderboard spec
