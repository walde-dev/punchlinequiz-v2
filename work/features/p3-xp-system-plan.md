# XP / Progression System — Implementation Plan

Supersedes the localStorage approach in `p3-xp-system.md`. Server-authoritative, anti-abuse, Clerk-gated.

## Goals (locked)

- DB-backed XP; server is the only source of truth.
- Earnable only when signed in (anonymous → 0 XP, soft CTA to sign in).
- One-time XP per individual punchline per user per mode (no regrind farming).
- One XP grant per daily challenge per user.
- Rate-limited: cannot autofarm via scripted submissions.
- Streaks are server-tracked.
- Admin can edit all values: per-correct XP, daily XP, streak bonuses, level thresholds, level names.
- Profile page shows level, XP, progress to next, longest streak, lines conquered.
- Visually joyful: +XP gold burst on correct answer, level-up takeover with confetti, streak flame in header.

## Schema (new tables)

`packages/db/src/schema.ts` adds:

```ts
// One row per Clerk user. Created lazily on first XP grant.
export const users = pgTable("users", {
  clerkId: varchar("clerk_id", { length: 64 }).primaryKey(),
  totalXp: integer("total_xp").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  // Whichever line they last scored on (used for streak break detection).
  lastCorrectAt: timestamp("last_correct_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// One row per punchline a user has earned XP on (any mode).
// UNIQUE (clerk_id, punchline_id, mode) — second grant attempt is a no-op.
// Mode is "artist" | "cloze" so a bar can be played in both modes for XP.
export const userPunchlineXp = pgTable(
  "user_punchline_xp",
  {
    id: serial("id").primaryKey(),
    clerkId: varchar("clerk_id", { length: 64 }).notNull().references(() => users.clerkId, { onDelete: "cascade" }),
    punchlineId: integer("punchline_id").notNull().references(() => punchlines.id),
    mode: varchar("mode", { length: 16 }).notNull(), // "artist" | "cloze" | "song_bonus"
    xpAwarded: integer("xp_awarded").notNull(),
    streakAtAward: integer("streak_at_award").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("user_punchline_mode_uq").on(t.clerkId, t.punchlineId, t.mode),
    byUser: index("user_punchline_xp_by_user").on(t.clerkId, t.createdAt),
  }),
)

// One row per daily challenge a user has completed. UNIQUE (clerk_id, date).
export const userDailyXp = pgTable(
  "user_daily_xp",
  {
    id: serial("id").primaryKey(),
    clerkId: varchar("clerk_id", { length: 64 }).notNull().references(() => users.clerkId, { onDelete: "cascade" }),
    date: date("date").notNull(),
    artistCorrect: boolean("artist_correct").notNull(),
    songCorrect: boolean("song_correct").notNull(),
    xpAwarded: integer("xp_awarded").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("user_daily_uq").on(t.clerkId, t.date),
  }),
)

// Singleton config row (id = 1). Editable in /admin/xp.
export const xpConfig = pgTable("xp_config", {
  id: integer("id").primaryKey().default(1),
  xpArtistCorrect: integer("xp_artist_correct").notNull().default(100),
  xpSongBonus: integer("xp_song_bonus").notNull().default(50),
  xpClozeCorrect: integer("xp_cloze_correct").notNull().default(150),
  xpDailyArtist: integer("xp_daily_artist").notNull().default(200),
  xpDailySong: integer("xp_daily_song").notNull().default(150),
  xpDailyPerfectBonus: integer("xp_daily_perfect_bonus").notNull().default(100),
  streakBonusPerStep: integer("streak_bonus_per_step").notNull().default(25),
  streakMaxBonus: integer("streak_max_bonus").notNull().default(250),
  // Streak resets after this many minutes of inactivity (default 24h).
  streakIdleResetMinutes: integer("streak_idle_reset_minutes").notNull().default(1440),
  // Rate limit: max correct answers per minute. Beyond this, server still
  // returns the validation but skips the XP grant.
  maxCorrectPerMinute: integer("max_correct_per_minute").notNull().default(20),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// Editable ranks. Lowest threshold first. Seeded with 10 German hip-hop ranks.
export const levels = pgTable("levels", {
  id: serial("id").primaryKey(),
  // First level with threshold > totalXp determines current level.
  threshold: integer("threshold").notNull().unique(),
  nameDe: varchar("name_de", { length: 80 }).notNull(),
  nameEn: varchar("name_en", { length: 80 }).notNull(),
  // Tailwind-safe color token for the chip; defaults to primary.
  accent: varchar("accent", { length: 24 }).notNull().default("primary"),
})
```

Migration `0009_xp_system.sql` is generated via `pnpm --filter @workspace/db drizzle-kit generate` + a hand-written `INSERT` to seed `xp_config` (id=1) and the 10 levels:

| Level | Threshold | DE | EN |
|---|---|---|---|
| 1 | 0 | Neuling | Rookie |
| 2 | 500 | Hörer | Listener |
| 3 | 1500 | Mitläufer | Follower |
| 4 | 3500 | Kenner | Connoisseur |
| 5 | 7000 | Headnodder | Headnodder |
| 6 | 12500 | Reimwächter | Bar Guard |
| 7 | 20000 | Lyricist | Lyricist |
| 8 | 32000 | Punchliner | Punchliner |
| 9 | 50000 | Veteran | Veteran |
| 10 | 80000 | OG | OG |

## Server-side XP grant logic

New file `apps/web/src/lib/xp.ts` exports:

```ts
type XpGrantInput = {
  clerkId: string
  punchlineId: number
  mode: "artist" | "cloze" | "song_bonus" | "daily"
  date?: string // daily only
  artistCorrect?: boolean // daily only
  songCorrect?: boolean // daily only
}

export async function grantXpForCorrect(input): Promise<XpGrantResult | null>
```

Internal flow (single SQL transaction):
1. Upsert `users` row (clerk_id) with defaults.
2. Rate-limit check: count `user_punchline_xp` rows in last 60s for this user. If ≥ `maxCorrectPerMinute`, return `{ skipped: "rate_limited" }`.
3. Compute base XP from `xp_config` keyed by mode.
4. Streak: load `users.last_correct_at` and `current_streak`. If now - last > idleResetMinutes, set streak = 1; else streak += 1. Bonus = min(streak * streakBonusPerStep, streakMaxBonus).
5. Total = base + streakBonus.
6. Insert `user_punchline_xp` (or `user_daily_xp` for daily) with `ON CONFLICT DO NOTHING`. If no row inserted → return `{ skipped: "duplicate" }`.
7. Update `users.totalXp += total`, `currentStreak = streak`, `longestStreak = max(...)`, `lastCorrectAt = now()`.
8. Read levels to determine old level (pre-grant total) vs new level. Return `{ xpAwarded, streak, totalXp, level, leveledUp, levelName }`.

Wired in three places — `submitAnswer`, `submitClozeGuess`, `submitSongGuess`, and the daily counterparts:

```ts
// inside submitAnswer handler, after computing isCorrect
let xp: XpGrantResult | null = null
if (isCorrect) {
  const actor = await getActor(getRequest())
  if (actor?.actor.kind === "clerk") {
    xp = await grantXpForCorrect({ clerkId: actor.actor.userId, punchlineId: data.punchlineId, mode: "artist" })
  }
}
return { ...existing, xp }
```

The XP result is appended to every existing answer response; client just reads `res.xp` if present.

### Why this is anti-abuse

- **One-shot per (user, line, mode)** enforced by unique index — no regrind farming.
- **Server validates the answer**; client cannot inject `isCorrect: true`.
- **Rate limit** at 20 correct/min stops headless-browser autofarming. Tunable.
- **Streak idle reset** is server-side time; client can't fake clock.
- **Daily one-shot** enforced by `UNIQUE(clerk_id, date)`.
- **Anonymous users earn nothing** — no localStorage shadow XP that can be tampered.

## Client surfaces

### Profile page

New route `apps/web/src/routes/profile.tsx`. Loader calls `getProfileFn()` (signed-in only; throws redirect to home with sign-in modal if anonymous):

```ts
export const getProfileFn = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await getActor(getRequest())
  if (actor?.actor.kind !== "clerk") throw new Error("unauthorized")
  const clerkId = actor.actor.userId
  // 1 read: users row + currentLevel join + nextLevel join + counts + last30days bucket
  // ...
  return {
    totalXp, currentStreak, longestStreak,
    level: { id, name, threshold }, nextLevel: { name, threshold } | null,
    progressPct, // (xp - lvlThreshold) / (next - lvlThreshold)
    linesConquered, daysCompleted,
    last30: [{ date, xp }],
  }
})
```

Visual layout (mobile-first, gold-on-charcoal):
- Hero: big level name, level number, XP bar with shimmer, "240 XP to **Headnodder**" caption.
- Stat row: 🔥 streak · longest 🔥 · lines · daily streak.
- Sparkline of last 30 days (CSS-only — no chart lib).
- Recent grants list (last 10) — bar excerpt + +XP chip.

### XP bar in play

New component `XpHeaderChip` rendered in `AppHeader` next to streak counter when `clerk` user is signed in. Shows: current level name, mini progress bar, total XP. Tap → `/profile`. Receives data via a thin `useSWR`-style hook that hits `getProfileFn()` on mount and refetches on round transitions.

### +XP gain animation

When `res.xp` returns on a correct submission, render a `<XpGain xp={total} streak={streak} />` overlay:
- Gold pill `+125 XP` floats from blockquote center → header XP bar in 700ms, `cubic-bezier(0.16, 1, 0.3, 1)` ease-out.
- If streak ≥ 3, secondary `🔥 ×3` chip eases in at 80ms stagger.
- If `leveledUp: true`, suppress the floater and fire the level-up takeover instead.

### Level-up takeover

Full-screen modal, 1 of-a-kind moment:
- Black overlay fade-in 200ms.
- Center: small "Level Up" eyebrow (gold, tracked), giant rank name (clamp 3rem-5rem, ExtraBold), level number badge.
- Confetti burst (reuse existing `<Confetti />`).
- Subtitle: "Du bist jetzt einer der echten — [Rank]." (DE) / "You're one of the real ones now — [Rank]." (EN)
- One CTA "Weitermachen". Tapping outside also dismisses.
- Marker logged: `level_up` event.

### Sign-in CTA (anonymous)

If the user gets a correct answer while logged out, instead of `+XP` show:
- A subtle ghost chip "Anmelden, um XP zu sammeln →" that opens Clerk's `SignInButton` modal.
- Only show once per session (suppress via `sessionStorage`).

## Admin surfaces

### `/admin/xp` page

Form bound to `xp_config` singleton. Every column gets a number input with a label and a one-line hint. Submit → PUT `/api/admin/xp-config`. The `actor` is audited.

### `/admin/levels` page

Table of levels with inline editing:
- Add row, delete row, edit threshold/name_de/name_en/accent.
- Validation: thresholds must be unique and strictly increasing (server-enforced).
- Submit → PUT `/api/admin/levels` (replaces all levels atomically inside a transaction).

Both pages live in the admin shell (sidebar gets two new entries: "XP-Werte", "Level").

## Files touched / created

**New**
- `packages/db/drizzle/0009_xp_system.sql` (generated + seed)
- `apps/web/src/lib/xp.ts`
- `apps/web/src/routes/profile.tsx`
- `apps/web/src/components/xp-gain.tsx`
- `apps/web/src/components/level-up-modal.tsx`
- `apps/web/src/components/xp-header-chip.tsx`
- `apps/web/src/routes/admin/xp.tsx`
- `apps/web/src/routes/admin/levels.tsx`
- `apps/web/src/routes/api/admin/xp-config.ts`
- `apps/web/src/routes/api/admin/levels.ts`

**Modified**
- `packages/db/src/schema.ts` — new tables + exports.
- `apps/web/src/lib/game.ts` — call `grantXpForCorrect` in submit handlers, return `xp` field.
- `apps/web/src/lib/daily.ts` — call `grantXpForCorrect` in daily submits with `mode: "daily"`.
- `apps/web/src/routes/play.tsx` — render `<XpGain />` on correct, `<LevelUpModal />` on level-up.
- `apps/web/src/routes/daily.tsx` — same.
- `apps/web/src/components/app-header.tsx` — render `<XpHeaderChip />` when signed-in.
- `apps/web/src/components/admin-shell.tsx` — add XP / Levels sidebar entries.
- `apps/web/src/i18n/locales/{de,en}.json` — new strings.
- `apps/web/src/lib/track.ts` — no changes needed (logEvent already supports arbitrary props).

## Animation specs (per emil-design-eng)

| Element | Property | Easing | Duration |
|---|---|---|---|
| `+XP` chip float | `transform: translate(...)`, `opacity` | `cubic-bezier(0.16, 1, 0.3, 1)` | 700ms |
| XP bar fill | `transform: scaleX()` | `cubic-bezier(0.23, 1, 0.32, 1)` | 600ms |
| Level-up overlay fade | `opacity` | `ease-out` | 200ms |
| Level-up name pop | `transform: scale(0.95 → 1)`, `opacity` | `cubic-bezier(0.16, 1, 0.3, 1)` | 450ms |
| Streak flame pulse | `transform: scale(1 → 1.15 → 1)` | `ease-in-out` | 600ms, on increment only |
| XP chip on header :active | `transform: scale(0.97)` | `ease-out` | 160ms |

All animations skipped when `prefers-reduced-motion: reduce` (use opacity only).

## Verification checklist

- [ ] `pnpm typecheck` passes.
- [ ] Anonymous user plays correctly → no XP row inserted; UI shows "sign in to earn XP" once.
- [ ] Signed-in user gets correct → row appears; total_xp incremented.
- [ ] Same user replays same bar in same mode → response includes `xp: { skipped: "duplicate" }`; no `+XP` shown.
- [ ] Same user plays same bar in artist then cloze mode → both grant XP.
- [ ] Rapid-fire 25 correct answers in 60s via script → 21st onwards `skipped: "rate_limited"`.
- [ ] Daily completed once → second visit shows no XP grant.
- [ ] Streak: 5 correct in a row gives `streak_at_award=5` and bonus = 125 (default 25×5).
- [ ] Idle > 24h then correct → streak resets to 1.
- [ ] Crossing a level threshold → response has `leveledUp: true`, modal shows.
- [ ] `/profile` renders correct totals, sparkline, level progress.
- [ ] `/admin/xp` saves edits and immediately changes future grants.
- [ ] `/admin/levels` add/edit/delete works; threshold uniqueness enforced.
