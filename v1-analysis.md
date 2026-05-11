# v1 Analysis — What to Keep and What to Kill

## v1 Tech Stack

- Next.js 15 (T3 stack with create-t3-app)
- Drizzle ORM with SQLite (libSQL)
- NextAuth v5 (beta) with Google OAuth
- Tailwind CSS + Radix UI components
- Spotify Web API for album art + artist data
- FingerprintJS for anonymous session tracking
- React Query (TanStack) for data fetching
- react-confetti for celebration effect

## What Worked

### Core Game Logic (`src/lib/game.ts`)
Simple text normalization — this is solid, keep it:
```typescript
function normalizeText(text: string): string {
  let normalizedText = text.toLowerCase();
  normalizedText = normalizedText.replace(/\s+/g, " ");
  normalizedText = normalizedText.trim();
  normalizedText = normalizedText.replace(/ß/g, "ss");
  normalizedText = normalizedText.replace(/[.,?!:;]/g, "");
  normalizedText = normalizedText.replace(/[^a-z0-9]/g, "");
  return normalizedText;
}

export function checkSolution(guess: string, solution: string): boolean {
  return normalizeText(guess) === normalizeText(solution);
}
```

### Data Model
Artists → Albums → Songs → Punchlines hierarchy is good. Each punchline has:
- `line` — the punchline text with blanks (marked with `/` for line breaks)
- `perfectSolution` — the exact answer
- `acceptableSolutions` — JSON array of alternative acceptable answers
- Linked to a song, which links to an album and artist

### Spotify Integration
Album art and artist images pulled from Spotify. Nice visual touch.

### The Reveal
After correct guess or showing solution: displays full punchline, song name, artist, album with cover art. Satisfying moment.

## What to Kill

### NextAuth + Google OAuth
Over-engineered. 50 users don't need OAuth. For v2:
- No auth for MVP
- Leaderboard can use a simple nickname + localStorage
- Add auth later only if needed for premium features

### Fingerprinting System
`@fingerprintjs/fingerprintjs` + `anonymousSessions` + `anonymousActivity` tables. Complex tracking for a quiz. For v2:
- Just use localStorage to track play count and stats
- No server-side anonymous session tracking needed

### Admin Panel
Full CRUD admin for punchlines (`src/app/admin/`). For v2:
- Seed punchlines via a JSON file or database script
- Add admin panel later when there's a community submitting punchlines

### Free Play Limit (3 plays then forced login)
This kills the viral loop. People share a quiz link, friends come, get blocked after 3 plays, leave. For v2:
- Unlimited plays for everyone
- Login only for leaderboard participation and stats persistence

### Over-engineered UI Components
20+ Radix UI components in `src/components/ui/`. Most unused. For v2:
- Use shadcn/ui but only install what you need
- Or just use plain Tailwind — it's a quiz, not a dashboard

## What to Add

### Share Card (CRITICAL — doesn't exist in v1)
After solving, generate a shareable image:
- "ich hab 8/10 im Kollegah-Quiz geraten. schaffst du mehr?"
- Clean design with quiz score, artist theme
- Download as image / share to WhatsApp / Instagram / Twitter
- This is the #1 distribution mechanism

### Artist Mode
Filter punchlines by artist. Play "only Kollegah" or "only Haftbefehl".
- Artist selection screen before starting
- Each artist = a separate shareable quiz
- This enables targeted distribution (post in artist-specific communities)

### Leaderboard
- Weekly leaderboard (resets every Monday)
- Score = correct guesses / total attempts
- Top 10 displayed on homepage
- Login with nickname (no OAuth) to participate

### No Login Wall
- Unlimited plays for everyone
- Login only for: leaderboard, stats persistence, punchline submissions
- Use simple nickname auth (email optional) or just localStorage

## v1 Punchline Data Structure

Each punchline in the database:
- Connected to a Song (with Spotify ID)
- Song connected to Album (with Spotify ID, cover image)
- Album connected to Artist (with Spotify ID, name, image)
- Punchline has `line` (the quiz text), `perfectSolution`, `acceptableSolutions` (JSON array)

The punchline text uses `/` to mark line breaks, which gets rendered with bold styling.

## v1 File Structure (reference)

```
src/
  app/
    page.tsx          — Landing page ("Teste dein Rap-Wissen")
    play/page.tsx     — Main game page
    admin/            — Admin panel (kill for v2)
    actions/          — Server actions (game, punchlines, users, etc.)
    api/              — API routes (spotify, auth, user, track)
    hooks/            — React hooks (useGame, usePunchlines, useFingerprint, etc.)
  components/
    ui/               — 20+ Radix UI components (overkill)
    spotify/          — Spotify status components
    header/           — Header with profile button
    footer/           — Footer
    auth/             — Auth dialog
    onboarding-dialog.tsx
    song-search.tsx
  server/
    db/
      schema.ts       — Drizzle schema (artists, albums, songs, punchlines, users, etc.)
      index.ts        — DB connection
    spotify.ts        — Spotify API client
    auth/             — NextAuth config
  lib/
    game.ts           — Text normalization + solution checking
    utils.ts          — Utility functions
```
