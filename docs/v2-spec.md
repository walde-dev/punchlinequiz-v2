# v2 Spec — What to Build

## Philosophy

Ship the smallest thing that gets users playing and sharing. No auth, no admin panel, no tracking. Just quiz → score → share → repeat.

## MVP Features (ship this week)

### 1. Quiz Game
- Show a punchline with missing words
- User types guess
- Unlimited attempts (show solution after 3 fails)
- Confetti on correct answer
- Show song info + album art on reveal
- "Nächste Punchline" button

### 2. Artist Mode
- Before playing, user can select an artist (or "Alle")
- Each artist = separate quiz experience
- Artist selection shows artist image + name
- URL structure: `/play?artist=kollegah` or `/play?artist=haftbefehl`

### 3. Share Card (THE viral mechanic)
After completing a round (e.g., 10 punchlines):
- Generate a shareable image with:
  - Score: "8/10 geraten"
  - Artist theme (if filtered)
  - Branding: punchlinequiz.de
  - Call to action: "schaffst du mehr?"
- Options: download image, copy link, share to WhatsApp/Instagram/Twitter
- Use `html-to-image` or `canvas` API to generate the card

### 4. Score Tracking
- Track: total played, correct, incorrect, streak
- Store in localStorage (no server needed)
- Show stats on a simple `/stats` page
- Show current session score during play

### 5. Landing Page
- Hero: "Teste dein Rap-Wissen"
- Artist grid: pick your artist to start
- "Jetzt spielen" button (random mode)
- Simple, clean, mobile-first

## Post-MVP (iterate based on feedback)

### Leaderboard
- Weekly leaderboard (resets Monday)
- Login with nickname (no OAuth)
- Display top 10 scores
- Requires minimal auth (nickname + localStorage token)

### Punchline Submissions
- "Schlag eine Punchline vor" form
- Community can submit new punchlines
- Admin review before adding to rotation

### Multiplayer / Group Mode
- Send a link, race to answer
- Real-time with WebSockets or polling
- "Wer ist der bessere Rap-Head?" mode

### Daily Challenge
- One punchline per day, everyone gets the same one
- Share your result (Wordle-style grid)
- "Heute: Apache 207" — one shot, make it count

## Tech Stack

### Recommended
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS + shadcn/ui (minimal components)
- **Database:** Vercel Postgres or Turso (SQLite edge DB)
- **ORM:** Drizzle ORM
- **Deployment:** Vercel (free tier)
- **Domain:** punchlinequiz.de

### What NOT to use
- No NextAuth (no auth for MVP)
- No FingerprintJS (no anonymous tracking)
- No Spotify API integration (hardcode album art URLs or use artist images from a static dataset)
- No React Query (just use server components + simple client state)

### Keep Simple
- Server components where possible
- Client state with useState + localStorage
- Server actions for game logic
- Static data for punchlines (JSON or DB seed)

## Data Model (simplified from v1)

### Core Tables

**artists**
- id (text, primary key — Spotify ID or custom)
- name (text)
- image (text — URL to artist image)

**songs**
- id (text, primary key)
- name (text)
- artist_id (text, FK → artists)
- album_name (text)
- album_image (text — URL to album art)

**punchlines**
- id (int, auto-increment)
- line (text — the punchline with blanks)
- perfect_solution (text — the exact answer)
- acceptable_solutions (text — JSON array of alternatives)
- song_id (text, FK → songs)

### No User Tables Needed for MVP
All tracking via localStorage.

## Punchline Format

From v1, punchlines use `/` to mark line breaks:
```
Ich bin der Boss und du bist nur ein Kleiner / 
Ich fahr Porsche und du fährst Fahrrad, Digga
```

The blanks are the words the user needs to guess. The `perfectSolution` is the exact text. `acceptableSolutions` is a JSON array of alternative spellings/answers.

## Normalization Logic (from v1)

Keep this exactly — it handles German text well:
- Lowercase
- ß → ss
- Strip punctuation (.,?!:;)
- Strip all non-alphanumeric characters
- Compare normalized strings

## Pages

```
/              — Landing page (hero + artist grid + play button)
/play          — Main game (query params: ?artist=kollegah&round=1)
/stats         — User stats (localStorage)
/leaderboard   — Weekly leaderboard (post-MVP)
```

## Mobile First

Target audience uses phones. Design for mobile first:
- Large text for punchlines (readable on small screens)
- Big input field for typing guesses
- Share buttons prominently placed
- Artist grid as horizontal scroll on mobile
