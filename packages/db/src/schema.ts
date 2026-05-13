import { boolean, integer, json, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core"

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
  perfectSolution: json("perfect_solution").$type<string[]>().notNull().default([]),
  acceptableSolutions: json("acceptable_solutions").$type<string[][]>().notNull().default([]),
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

export type Artist = typeof artists.$inferSelect
export type NewArtist = typeof artists.$inferInsert
export type Song = typeof songs.$inferSelect
export type NewSong = typeof songs.$inferInsert
export type Punchline = typeof punchlines.$inferSelect
export type NewPunchline = typeof punchlines.$inferInsert
export type GameEvent = typeof gameEvents.$inferSelect
export type NewGameEvent = typeof gameEvents.$inferInsert
