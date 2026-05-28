import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const artists = pgTable("artists", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  imageUrl: text("image_url"),
  artworkProvider: varchar("artwork_provider", { length: 16 }),
  artworkExternalId: varchar("artwork_external_id", { length: 32 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const songs = pgTable("songs", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id")
    .notNull()
    .references(() => artists.id),
  title: varchar("title", { length: 300 }).notNull(),
  album: varchar("album", { length: 300 }),
  albumArtUrl: text("album_art_url"),
  artworkProvider: varchar("artwork_provider", { length: 16 }),
  artworkTrackId: varchar("artwork_track_id", { length: 32 }),
  artworkAlbumId: varchar("artwork_album_id", { length: 32 }),
  releaseYear: integer("release_year"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const punchlines = pgTable("punchlines", {
  id: serial("id").primaryKey(),
  songId: integer("song_id")
    .notNull()
    .references(() => songs.id),
  line: text("line").notNull(),
  /**
   * Display string for finishing-lines mode: the line with `___` at the blank
   * position. When null, the punchline is only playable in classic
   * artist-guess mode (no cloze authored).
   */
  clozePrompt: text("cloze_prompt"),
  /**
   * Accepted answers for the cloze blank. Each entry is one acceptable full
   * answer string (e.g. ["Maus", "die Maus"]). Matching is normalized: case-
   * insensitive, diacritic-folded, punctuation-loose.
   */
  perfectSolution: json("perfect_solution").$type<string[]>().notNull().default([]),
  /** Reserved for token-level alternates; unused at the moment. */
  acceptableSolutions: json("acceptable_solutions").$type<string[][]>().notNull().default([]),
  /**
   * Whether an admin has manually verified the bar in the review queue.
   * Backfilled to false for existing rows; new rows default to false too —
   * the review queue surfaces only `reviewed=false` cards.
   */
  reviewed: boolean("reviewed").notNull().default(false),
  /**
   * Soft toggle to exclude a bar from cloze (artist-filtered) mode even when
   * a cloze_prompt is authored. Some lines just don't pun well — keep them
   * in classic mode by flipping this off.
   */
  clozeEnabled: boolean("cloze_enabled").notNull().default(true),
  distractor1Id: integer("distractor1_id")
    .notNull()
    .references(() => artists.id),
  distractor2Id: integer("distractor2_id")
    .notNull()
    .references(() => artists.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const gameEvents = pgTable("game_events", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  props: json("props").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const artistTags = pgTable(
  "artist_tags",
  {
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    weight: doublePrecision("weight").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.artistId, t.tagId] }),
  }),
)

export const dailyChallenges = pgTable("daily_challenges", {
  id: serial("id").primaryKey(),
  /** ISO date (YYYY-MM-DD) the bar is featured on. Unique — one bar per day. */
  date: date("date").notNull().unique(),
  punchlineId: integer("punchline_id")
    .notNull()
    .references(() => punchlines.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export type Artist = typeof artists.$inferSelect
export type NewArtist = typeof artists.$inferInsert
export type Song = typeof songs.$inferSelect
export type NewSong = typeof songs.$inferInsert
export type Punchline = typeof punchlines.$inferSelect
export type NewPunchline = typeof punchlines.$inferInsert
export type GameEvent = typeof gameEvents.$inferSelect
export type NewGameEvent = typeof gameEvents.$inferInsert
export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
export type ArtistTag = typeof artistTags.$inferSelect
export type NewArtistTag = typeof artistTags.$inferInsert
export type DailyChallenge = typeof dailyChallenges.$inferSelect
export type NewDailyChallenge = typeof dailyChallenges.$inferInsert

/**
 * XP system. Tables are server-authoritative: the client never writes XP
 * directly. Anonymous players earn no XP (rows are keyed by Clerk user id).
 */
export const users = pgTable(
  "users",
  {
    clerkId: varchar("clerk_id", { length: 64 }).primaryKey(),
    totalXp: integer("total_xp").notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    /** Last correct answer time. Drives streak idle reset. */
    lastCorrectAt: timestamp("last_correct_at"),
    /** Updated on every server-validated submit (right or wrong). Drives cooldown. */
    lastAttemptAt: timestamp("last_attempt_at"),
    /**
     * Public leaderboard handle. Null until the user completes first-sign-in
     * onboarding. Case-insensitive unique via the lower(handle) index — NULLs
     * are distinct in Postgres, so un-onboarded users never collide.
     */
    handle: varchar("handle", { length: 20 }),
    /** Reserved for the (future) preset avatar pack. Stored, not yet rendered. */
    avatarKey: varchar("avatar_key", { length: 40 }),
    /** Set when the user picks a handle. Null = onboarding incomplete. */
    onboardedAt: timestamp("onboarded_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    handleLowerUq: uniqueIndex("users_handle_lower_uq").on(sql`lower(${t.handle})`),
    byTotalXp: index("users_total_xp").on(t.totalXp),
  }),
)

/**
 * One row per (user, punchline). Records the primary correct-answer grant
 * (artist or cloze mode) and an optional song-bonus add-on. The unique
 * (clerk_id, punchline_id) index makes the grant idempotent: replaying a
 * solved bar is a no-op. Song bonus is layered onto the existing row.
 */
export const userPunchlineXp = pgTable(
  "user_punchline_xp",
  {
    id: serial("id").primaryKey(),
    clerkId: varchar("clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    punchlineId: integer("punchline_id")
      .notNull()
      .references(() => punchlines.id),
    /** "artist" | "cloze" — which mode awarded the primary XP. */
    primaryMode: varchar("primary_mode", { length: 16 }).notNull(),
    /** Cumulative XP awarded for this line (primary + song bonus). */
    xpAwarded: integer("xp_awarded").notNull(),
    streakAtAward: integer("streak_at_award").notNull(),
    songBonusAwarded: boolean("song_bonus_awarded").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("user_punchline_uq").on(t.clerkId, t.punchlineId),
    byUser: index("user_punchline_xp_by_user").on(t.clerkId, t.createdAt),
    byCreatedAt: index("user_punchline_xp_created_at").on(t.createdAt),
  }),
)

/**
 * One row per (user, daily date). UNIQUE prevents double-grant on the same
 * day. The song grant is folded in via UPSERT — first call inserts the
 * artist outcome, the song submit updates the row.
 */
export const userDailyXp = pgTable(
  "user_daily_xp",
  {
    id: serial("id").primaryKey(),
    clerkId: varchar("clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    date: date("date").notNull(),
    artistCorrect: boolean("artist_correct").notNull(),
    songCorrect: boolean("song_correct").notNull().default(false),
    songResolved: boolean("song_resolved").notNull().default(false),
    xpAwarded: integer("xp_awarded").notNull(),
    streakAtAward: integer("streak_at_award").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("user_daily_uq").on(t.clerkId, t.date),
    byCreatedAt: index("user_daily_xp_created_at").on(t.createdAt),
  }),
)

/**
 * Singleton config row (id = 1). CHECK constraint enforces that no other id
 * can exist — protects the singleton invariant at the DB layer.
 */
export const xpConfig = pgTable(
  "xp_config",
  {
    id: integer("id").primaryKey(),
    xpArtistCorrect: integer("xp_artist_correct").notNull().default(100),
    xpClozeCorrect: integer("xp_cloze_correct").notNull().default(150),
    xpSongBonus: integer("xp_song_bonus").notNull().default(50),
    xpDailyArtist: integer("xp_daily_artist").notNull().default(200),
    xpDailySong: integer("xp_daily_song").notNull().default(150),
    xpDailyPerfectBonus: integer("xp_daily_perfect_bonus").notNull().default(100),
    streakBonusPerStep: integer("streak_bonus_per_step").notNull().default(25),
    streakMaxBonus: integer("streak_max_bonus").notNull().default(250),
    streakIdleResetMinutes: integer("streak_idle_reset_minutes").notNull().default(1440),
    /** Server-enforced minimum delay between answer submissions. Blocks autofarm. */
    minSecondsBetweenAttempts: integer("min_seconds_between_attempts").notNull().default(2),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    singleton: check("xp_config_singleton", sql`${t.id} = 1`),
  }),
)

/**
 * Editable ranks. Current level = highest threshold ≤ totalXp. Next = lowest
 * threshold > totalXp. Threshold is UNIQUE.
 */
export const levels = pgTable("levels", {
  id: serial("id").primaryKey(),
  threshold: integer("threshold").notNull().unique(),
  nameDe: varchar("name_de", { length: 80 }).notNull(),
  nameEn: varchar("name_en", { length: 80 }).notNull(),
  /** Tailwind/CSS accent token (defaults to "primary" = gold). */
  accent: varchar("accent", { length: 24 }).notNull().default("primary"),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UserPunchlineXp = typeof userPunchlineXp.$inferSelect
export type NewUserPunchlineXp = typeof userPunchlineXp.$inferInsert
export type UserDailyXp = typeof userDailyXp.$inferSelect
export type NewUserDailyXp = typeof userDailyXp.$inferInsert
export type XpConfig = typeof xpConfig.$inferSelect
export type NewXpConfig = typeof xpConfig.$inferInsert
export type Level = typeof levels.$inferSelect
export type NewLevel = typeof levels.$inferInsert
