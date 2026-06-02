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
  /**
   * The contributor whose accepted submission minted this bar (PUN-67). Null
   * for admin-authored bars. Drives the public "eingereicht von @handle" credit.
   * Set at mint time in the admin approve path; no FK action on user delete —
   * the bar outlives the account (credit just stops resolving a handle).
   */
  submittedByClerkId: varchar("submitted_by_clerk_id", { length: 64 }),
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
    /**
     * Clerk profile image URL, synced client-side from the signed-in session so
     * the public profile (/u/handle) can render real avatars for any user, not
     * just the viewer. Null until first sync.
     */
    imageUrl: text("image_url"),
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
    /** Flat XP granted to a contributor when their submission is accepted (PUN-65). */
    xpSubmissionAccepted: integer("xp_submission_accepted").notNull().default(500),
    /** XP to the referrer when a referral is confirmed (PUN-72). */
    xpReferralReferrer: integer("xp_referral_referrer").notNull().default(300),
    /** Welcome XP to the referred user on confirmation (PUN-72). */
    xpReferralReferee: integer("xp_referral_referee").notNull().default(150),
    /** Max referrer-rewarded referrals per UTC day — anti-farm ceiling (PUN-72). */
    referralDailyCap: integer("referral_daily_cap").notNull().default(10),
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

/**
 * Asymmetric follow graph (no approval). A row means follower → followee.
 * "Friends" = the set a user follows. FKs cascade so deleting a user tears
 * down their follow edges in both directions. The composite PK (follower,
 * followee) makes follow idempotent and already indexes follower-prefix
 * lookups (a user's following list / friends set); the extra index on
 * followee powers follower-list lookups. Self-follow is blocked at the DB.
 */
export const follows = pgTable(
  "follows",
  {
    followerClerkId: varchar("follower_clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    followeeClerkId: varchar("followee_clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.followerClerkId, t.followeeClerkId] }),
    byFollowee: index("follows_followee").on(t.followeeClerkId),
    noSelf: check("follows_no_self", sql`${t.followerClerkId} <> ${t.followeeClerkId}`),
  }),
)

export type Follow = typeof follows.$inferSelect
export type NewFollow = typeof follows.$inferInsert

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

/**
 * First-attempt ledger for reveal-bearing game steps. A wrong/skip answer
 * reveals the correct answer, so that reveal must also spend the signed-in
 * user's chance to earn XP for that step. The unique key makes later replayed
 * submits read as "already spent" even if the replay is correct.
 */
export const userAnswerAttempts = pgTable(
  "user_answer_attempts",
  {
    id: serial("id").primaryKey(),
    clerkId: varchar("clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    punchlineId: integer("punchline_id")
      .notNull()
      .references(() => punchlines.id, { onDelete: "cascade" }),
    /** "artist" | "cloze" | "song" */
    kind: varchar("kind", { length: 16 }).notNull(),
    correct: boolean("correct").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("user_answer_attempts_uq").on(t.clerkId, t.punchlineId, t.kind),
    byUser: index("user_answer_attempts_by_user").on(t.clerkId, t.createdAt),
  }),
)

export type UserAnswerAttempt = typeof userAnswerAttempts.$inferSelect
export type NewUserAnswerAttempt = typeof userAnswerAttempts.$inferInsert

/**
 * Challenges (PUN-8/9/10). A challenge freezes a dedicated 5-bar set (artist-
 * guess mode) into a shareable, one-to-many "beat my score" board. `bar_ids`
 * is the ordered snapshot of punchline ids; `slug` is the short URL key.
 */
export const challenges = pgTable("challenges", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 16 }).notNull().unique(),
  creatorClerkId: varchar("creator_clerk_id", { length: 64 })
    .notNull()
    .references(() => users.clerkId, { onDelete: "cascade" }),
  /** Ordered snapshot of the 5 punchline ids — the frozen set. */
  barIds: json("bar_ids").$type<number[]>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

/**
 * One row per (challenge, user). UNIQUE enforces first-attempt-lock: a user's
 * first completed run is their permanent board score; later replays never
 * overwrite it (insert is onConflictDoNothing). Ranked correct_count DESC,
 * then solve_ms ASC (the tiebreak). Anonymous runs are not persisted until the
 * player signs up and claims.
 */
export const challengeAttempts = pgTable(
  "challenge_attempts",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    clerkId: varchar("clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    correctCount: integer("correct_count").notNull(),
    solveMs: integer("solve_ms").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("challenge_attempt_uq").on(t.challengeId, t.clerkId),
    byChallenge: index("challenge_attempt_by_challenge").on(t.challengeId),
  }),
)

export type Challenge = typeof challenges.$inferSelect
export type NewChallenge = typeof challenges.$inferInsert
export type ChallengeAttempt = typeof challengeAttempts.$inferSelect
export type NewChallengeAttempt = typeof challengeAttempts.$inferInsert

/**
 * UGC bar submissions (PUN-14/15/16). Staging table — we can't insert into
 * `punchlines` directly (song_id + distractor FKs are NOT NULL and submitters
 * may omit them). Only `line` is required; the admin completes the rest at
 * review and, on approval, mints a real punchline (`created_punchline_id`).
 */
export const punchlineSubmissions = pgTable(
  "punchline_submissions",
  {
    id: serial("id").primaryKey(),
    submitterClerkId: varchar("submitter_clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    line: text("line").notNull(),
    /** Optional free-text / structured hints the submitter may provide. */
    clozePrompt: text("cloze_prompt"),
    perfectSolution: json("perfect_solution").$type<string[]>(),
    artistHint: text("artist_hint"),
    songHint: text("song_hint"),
    note: text("note"),
    /** 'pending' | 'approved' | 'rejected'. */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    /** Set on approval — the minted, playable punchline. */
    createdPunchlineId: integer("created_punchline_id").references(() => punchlines.id),
    rejectionReason: text("rejection_reason"),
    /**
     * When the contributor has seen the "your bar is live! +XP" celebration for
     * this acceptance (PUN-70). Null while approved-but-unseen → drives the
     * in-app pull payoff. Push notification deferred to PUN-22.
     */
    acceptanceSeenAt: timestamp("acceptance_seen_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byStatus: index("punchline_submissions_status").on(t.status, t.createdAt),
    bySubmitter: index("punchline_submissions_submitter").on(t.submitterClerkId),
  }),
)

export type PunchlineSubmission = typeof punchlineSubmissions.$inferSelect
export type NewPunchlineSubmission = typeof punchlineSubmissions.$inferInsert

/**
 * Per-user submission lease. The submissions table contains the durable audit
 * trail; this row is the short-window write gate so concurrent requests cannot
 * all pass a read-only cooldown check before inserting.
 */
export const submissionRateLimits = pgTable("submission_rate_limits", {
  clerkId: varchar("clerk_id", { length: 64 })
    .primaryKey()
    .references(() => users.clerkId, { onDelete: "cascade" }),
  lastSubmittedAt: timestamp("last_submitted_at").notNull().defaultNow(),
})

export type SubmissionRateLimit = typeof submissionRateLimits.$inferSelect
export type NewSubmissionRateLimit = typeof submissionRateLimits.$inferInsert

/**
 * Contributor XP ledger (PUN-65). One row per ACCEPTED submission — the UNIQUE
 * on submission_id makes the grant idempotent (admin approve can only fire once
 * on a pending row, but the unique index is the hard guarantee, mirroring the
 * user_punchline_xp pattern). Deliberately separate from user_punchline_xp:
 * that table's (clerk_id, punchline_id) unique would collide if a contributor
 * later solves their own minted bar. Grant adds to users.total_xp via SQL math,
 * so contributor XP feeds rank + the all-time XP board (NOT the weekly board,
 * which unions only the play-activity tables).
 */
export const contributorGrants = pgTable(
  "contributor_grants",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id")
      .notNull()
      .references(() => punchlineSubmissions.id, { onDelete: "cascade" }),
    clerkId: varchar("clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    /** XP awarded at acceptance (snapshot of xp_config.xp_submission_accepted). */
    xpAwarded: integer("xp_awarded").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("contributor_grants_submission_uq").on(t.submissionId),
    byUser: index("contributor_grants_by_user").on(t.clerkId, t.createdAt),
  }),
)

export type ContributorGrant = typeof contributorGrants.$inferSelect
export type NewContributorGrant = typeof contributorGrants.$inferInsert

/**
 * Referral edges + reward ledger (PUN-71/72). One row per referred user — the
 * UNIQUE on referee_clerk_id enforces one referrer per user (first-touch wins;
 * attribution insert is onConflictDoNothing). The row IS the ledger:
 * `status` flips pending → confirmed when the referee earns their first correct
 * answer; `referrer_xp`/`referee_xp` snapshot what was actually granted at that
 * moment (referrer_xp = 0 if the referrer was over their daily cap). `seen_at`
 * drives the referrer's in-app "@x joined! +XP" payoff. GDPR: clerkId→clerkId
 * only, no extra PII.
 */
export const referrals = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    referrerClerkId: varchar("referrer_clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    refereeClerkId: varchar("referee_clerk_id", { length: 64 })
      .notNull()
      .references(() => users.clerkId, { onDelete: "cascade" }),
    /** 'invite' (personal /i/$handle link) | 'challenge' (signed up via a challenge link). */
    source: varchar("source", { length: 16 }).notNull(),
    /** 'pending' (edge recorded at onboarding) | 'confirmed' (referee activated). */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    /** XP actually granted at confirmation (snapshot; referrer_xp=0 if cap-blocked). */
    referrerXp: integer("referrer_xp").notNull().default(0),
    refereeXp: integer("referee_xp").notNull().default(0),
    /** Referrer has seen the confirmation celebration for this referral. */
    seenAt: timestamp("seen_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at"),
  },
  (t) => ({
    refereeUq: uniqueIndex("referrals_referee_uq").on(t.refereeClerkId),
    byReferrer: index("referrals_by_referrer").on(t.referrerClerkId, t.status),
  }),
)

export type Referral = typeof referrals.$inferSelect
export type NewReferral = typeof referrals.$inferInsert
