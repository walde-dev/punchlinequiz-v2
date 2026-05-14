import {
  boolean,
  doublePrecision,
  integer,
  json,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

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
