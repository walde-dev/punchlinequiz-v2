# Design Direction — PunchlineQuiz v2

## Design Philosophy

**Spotify canvas + Wordle mechanics + hip hop voice.**

The UI should feel like a music app, not a quiz app. Users should feel like they're *in* the culture, not studying for a test. The tone is competitive, not friendly. "Prove you're real" not "have fun learning."

## Three Layers of DNA

### Layer 1: Spotify's Foundation (the canvas)
- Dark immersive background (#121212–#1f1f1f)
- Album art as the primary color source
- Pill-shaped buttons (500px–9999px radius)
- Compact typography (DM Sans, 10px–24px range)
- Heavy shadows on elevated elements
- UI recedes into darkness, content glows

### Layer 2: Wordle/Duolingo Mechanics (the game)
- Bold score display (big numbers, center stage)
- Streak tracking ("5 in a row!")
- Shareable result cards (the viral engine)
- Progress indicators during a round
- "Challenge a friend" flow
- Daily challenge mode (post-MVP)

### Layer 3: Hip Hop Voice (the personality)
- Competitive, not friendly. "Du hast 3/10. Peinlich." not "Great job!"
- German slang in UI copy (Digga, Ehre, Bruda)
- Confetti on correct = crowd cheering energy
- Wrong answer = "Nein. Nicht mal nah dran."
- Artist names in bold, always visible
- Punchline text is the hero — large, bold, unmissable

## Color Palette

### Base (from Spotify)
```
--bg-deepest:    #121212   (page background)
--bg-surface:    #181818   (cards, containers)
--bg-elevated:   #1f1f1f   (buttons, interactive surfaces)
--bg-highlight:  #252525   (hover states, elevated cards)
```

### Text
```
--text-primary:    #ffffff   (main text)
--text-secondary:  #b3b3b3   (muted labels, metadata)
--text-muted:      #7c7c7c   (disabled, hints)
```

### Accent — pick ONE
Option A: **Spotify Green** (#1ed760) — music-native, instantly recognizable
Option B: **Gold** (#ffd700) — crown/king energy, "der Beste" vibe
Option C: **Electric Purple** (#a855f7) — modern, stands out from Spotify
Option D: **Red** (#ef4444) — aggressive, bold, attention-grabbing

**CHOSEN: Gold (#fbbf24)** — crown/king energy, "der Beste" vibe. Gamified, competitive, premium. Works on dark backgrounds with high contrast. Customizable per artist later if needed.

### Semantic
```
--correct:     #fbbf24   (gold — right answer, king energy)
--wrong:       #f3727f   (red — wrong answer)
--streak:      #ffa42b   (orange — streak indicator)
--info:        #539df5   (blue — info states)
```

## Typography

### Font: DM Sans (Google Fonts)
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap">
```

### Hierarchy

**Punchline Text (the hero):**
- Size: 28px mobile / 40px desktop
- Weight: 700 (bold)
- Line height: 1.3
- Color: #ffffff
- This is the largest text on screen. It's the whole point of the app.

**Score Display:**
- Size: 64px mobile / 80px desktop
- Weight: 800 (extra bold)
- Color: accent color
- Monospace-style alignment for numbers

**Artist Name:**
- Size: 14px
- Weight: 600
- Text transform: uppercase
- Letter spacing: 1.4px
- Color: #b3b3b3

**Button Labels:**
- Size: 14px
- Weight: 700
- Text transform: uppercase
- Letter spacing: 1.4px
- Pill shape (9999px radius)

**Body Text:**
- Size: 16px
- Weight: 400
- Color: #ffffff

**Metadata/Captions:**
- Size: 12px–14px
- Weight: 400
- Color: #b3b3b3

## Component Patterns

### Quiz Card (the main game element)
```
┌─────────────────────────────────────┐
│                                     │
│  ARTIST NAME                    🔥  │  ← uppercase, muted, artist badge
│                                     │
│  "Ich bin der Kaiser, der          │  ← large, bold, white
│   Gegner ___________               │
│   und zerstört"                    │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Deine Antwort...           │   │  ← pill input, dark bg
│  └─────────────────────────────┘   │
│                                     │
│  [  RATEN  ]  ← pill button, gold   │
│                                     │
└─────────────────────────────────────┘
```
- Background: #181818
- Radius: 8px
- Shadow: rgba(0,0,0,0.3) 0px 8px 8px
- Padding: 24px mobile / 32px desktop

### Score Card (the share moment)
```
┌─────────────────────────────────────┐
│                                     │
│         PUNCHLINE QUIZ              │  ← branding
│                                     │
│            7 / 10                   │  ← huge number, accent color
│                                     │
│     Kollegah Edition                │  ← artist filter
│                                     │
│   ████████░░  70%                   │  ← progress bar
│                                     │
│  "schaffst du mehr?"               │  ← CTA
│                                     │
│  [  TEILEN  ]  [  NOCHMAL  ]       │  ← share + retry
│                                     │
│        punchlinequiz.de             │  ← domain
│                                     │
└─────────────────────────────────────┘
```
- This card is rendered as an image for sharing
- Clean, self-contained, works in WhatsApp/Instagram/Twitter
- Dark background with accent number

### Artist Selection Grid
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│  🎤      │ │  🎤      │ │  🎤      │
│          │ │          │ │          │
│ KOLLEGAH │ │ HAFTBEFEHL│ │ APACHE  │
│          │ │          │ │   207    │
└──────────┘ └──────────┘ └──────────┘
```
- Artist image as background (with overlay)
- Name in bold uppercase
- Pill shape or rounded square
- Hover: scale up slightly, glow with accent color
- Mobile: horizontal scroll

### Correct Answer Animation
1. Text turns gold (#fbbf24)
2. Confetti burst (react-confetti)
3. Solution revealed with slide-in from bottom
4. Album art slides in from right (desktop) / bottom (mobile)
5. "Nächste Punchline" button pulses gently

### Wrong Answer Animation
1. Input shakes briefly (CSS shake animation)
2. Text turns red (#f3727f) for 1 second, then resets
3. After 3 fails: "Lösung anzeigen" button appears

## Layout

### Mobile First (primary target)
```
┌─────────────────────┐
│     HEADER          │  ← logo + stats button
├─────────────────────┤
│                     │
│   QUIZ CARD         │  ← centered, full width
│                     │
├─────────────────────┤
│  ARTIST SELECT      │  ← horizontal scroll
│  ◄ Kollegah | Haft  │
├─────────────────────┤
│  SCORE BAR          │  ← 3/10 ●●●○○○○○○○
└─────────────────────┘
```

### Desktop
```
┌──────────────────────────────────────┐
│  HEADER                    STATS     │
├──────────────────────────────────────┤
│                                      │
│         QUIZ CARD (centered)         │
│         max-width: 640px             │
│                                      │
├──────────────────────────────────────┤
│  ARTIST GRID (horizontal)            │
└──────────────────────────────────────┘
```

## Micro-interactions

- **Typing in input:** subtle glow on the input border
- **Hover on buttons:** background lightens by 10%
- **Artist card hover:** scale(1.05), shadow increases
- **Score increment:** number animates up (count-up effect)
- **Streak milestone:** special animation at 5, 10, 20 streak
- **Page transition:** fade between quiz states (not hard cuts)

## Share Card Design

The share card is the most important design element. It's what goes viral.

### Rules
- Must work as a static image (screenshot or generated)
- Must be readable at small sizes (WhatsApp thumbnail)
- Must include: score, artist, domain, CTA
- Must look premium (not like a school project)

### Template
```
┌─────────────────────────────┐
│                             │
│    🎤 PUNCHLINE QUIZ        │  ← small, top
│                             │
│         7 / 10              │  ← HUGE, accent color
│                             │
│    KOLLEGAH EDITION         │  ← uppercase, muted
│                             │
│    ████████░░               │  ← progress bar
│                             │
│   "schaffst du mehr?"      │  ← CTA
│                             │
│    punchlinequiz.de         │  ← domain
│                             │
└─────────────────────────────┘
```

Dimensions: 1080×1080 (Instagram square) or 1200×630 (Twitter/WhatsApp)

## Don'ts

- Don't use light backgrounds — dark is the identity
- Don't use multiple accent colors — one accent, consistently
- Don't make it look like a school quiz — it's a competition
- Don't use stock illustrations — album art and typography are the visuals
- Don't add unnecessary animations — keep it snappy, not slow
- Don't use serif fonts — DM Sans, clean, modern
- Don't make the share card busy — clean, bold, minimal

## Reference Sites

- **Spotify:** dark UI, music-native, album art driven
- **Wordle:** shareable score cards, daily ritual, simple mechanics
- **Duolingo:** gamification, streaks, progress, competitive
- **Discord:** dark UI, gaming community aesthetic
- **Refero.design:** inspiration gallery for modern web design

## shadcn/ui Configuration

Use shadcn/ui as the component library foundation. It's built on Radix primitives + Tailwind, highly customizable.

### Setup
```bash
npx shadcn@latest init
# Choose: Dark theme, CSS variables, Zinc base
```

### Tailwind CSS Variables (globals.css)
```css
:root {
  --background: 0 0% 7.5%;          /* #131313 */
  --foreground: 0 0% 100%;           /* #ffffff */
  --card: 0 0% 9.4%;                /* #181818 */
  --card-foreground: 0 0% 100%;      /* #ffffff */
  --popover: 0 0% 9.4%;             /* #181818 */
  --popover-foreground: 0 0% 100%;   /* #ffffff */
  --primary: 43 96% 56%;             /* #fbbf24 — GOLD */
  --primary-foreground: 0 0% 7.5%;   /* #131313 — dark text on gold */
  --secondary: 0 0% 12.2%;          /* #1f1f1f */
  --secondary-foreground: 0 0% 100%; /* #ffffff */
  --muted: 0 0% 12.2%;              /* #1f1f1f */
  --muted-foreground: 0 0% 70.6%;   /* #b3b3b3 */
  --accent: 0 0% 12.2%;             /* #1f1f1f */
  --accent-foreground: 0 0% 100%;    /* #ffffff */
  --destructive: 0 72% 51%;         /* #f3727f */
  --destructive-foreground: 0 0% 100%;
  --border: 0 0% 18%;               /* #2e2e2e */
  --input: 0 0% 18%;                /* #2e2e2e */
  --ring: 43 96% 56%;               /* #fbbf24 — gold focus ring */
  --radius: 0.75rem;
}
```

### Components to Install
```bash
npx shadcn@latest add button card input badge progress alert dialog tabs
```

### Button Variants (extend shadcn defaults)
```tsx
// In button.tsx — add these variants
{
  variants: {
    variant: {
      gold: "bg-[#fbbf24] text-[#131313] hover:bg-[#f59e0b] font-bold uppercase tracking-wider",
      outline: "border border-[#2e2e2e] text-white hover:bg-[#1f1f1f]",
      ghost: "text-[#b3b3b3] hover:text-white hover:bg-[#1f1f1f]",
    },
    size: {
      pill: "h-10 px-6 rounded-full",  /* Spotify-style pill */
    }
  }
}
```

### Key shadcn Customizations
- Default radius: `0.75rem` (cards), `9999px` (pill buttons)
- All buttons default to uppercase + tracking-wider (1.4px)
- Card backgrounds: `#181818` with subtle border `#2e2e2e`
- Input focus ring: gold (`#fbbf24`)
- Progress bar: gold fill on dark track
