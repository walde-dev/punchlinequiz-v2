# PunchlineQuiz v2 — Overview

## What is this?

A German hip hop quiz platform. Users get shown a punchline with missing words and have to guess the correct lyrics. Built for the German rap community.

## Why rebuild from scratch?

v1 (walde-dev/punchlinequiz) was a T3 stack app that worked but had:
- Over-engineered auth (NextAuth + Google OAuth for 50 users)
- Complex anonymous session tracking (fingerprinting)
- Admin panel that wasn't needed for MVP
- No share functionality (the #1 viral mechanic)
- No artist filtering
- Forced login after 3 plays (kills viral loop)

v2 keeps the core game loop but strips everything else. Ship fast, iterate based on user feedback.

## Domain

punchlinequiz.de — already owned.

## Target audience

German hip hop fans. Age 16-30. Active on Reddit, TikTok, Instagram, WhatsApp groups. Passionate about arguing who's the best rapper.

## Core game loop

1. User sees a punchline with missing words (blanks)
2. User types their guess
3. System checks answer (normalized: lowercase, strip punctuation, ß→ss)
4. Correct → confetti, show song info + album art, offer share card
5. Wrong → try again (unlimited attempts, show solution after 3 fails)
6. Next punchline → repeat

## Tech stack (recommended)

- Next.js 15 (App Router)
- Tailwind CSS
- PostgreSQL (or SQLite for simplicity — Vercel Postgres or Turso)
- Drizzle ORM
- No auth library needed for MVP (just localStorage for stats)

## Repository

- Old repo (reference only): https://github.com/walde-dev/punchlinequiz
- New repo: https://github.com/walde-dev/punchlinequiz-v2
