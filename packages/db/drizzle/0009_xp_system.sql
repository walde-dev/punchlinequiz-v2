CREATE TABLE IF NOT EXISTS "users" (
	"clerk_id" varchar(64) PRIMARY KEY NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_correct_at" timestamp,
	"last_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_punchline_xp" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" varchar(64) NOT NULL,
	"punchline_id" integer NOT NULL,
	"primary_mode" varchar(16) NOT NULL,
	"xp_awarded" integer NOT NULL,
	"streak_at_award" integer NOT NULL,
	"song_bonus_awarded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_daily_xp" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" varchar(64) NOT NULL,
	"date" date NOT NULL,
	"artist_correct" boolean NOT NULL,
	"song_correct" boolean DEFAULT false NOT NULL,
	"song_resolved" boolean DEFAULT false NOT NULL,
	"xp_awarded" integer NOT NULL,
	"streak_at_award" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "xp_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"xp_artist_correct" integer DEFAULT 100 NOT NULL,
	"xp_cloze_correct" integer DEFAULT 150 NOT NULL,
	"xp_song_bonus" integer DEFAULT 50 NOT NULL,
	"xp_daily_artist" integer DEFAULT 200 NOT NULL,
	"xp_daily_song" integer DEFAULT 150 NOT NULL,
	"xp_daily_perfect_bonus" integer DEFAULT 100 NOT NULL,
	"streak_bonus_per_step" integer DEFAULT 25 NOT NULL,
	"streak_max_bonus" integer DEFAULT 250 NOT NULL,
	"streak_idle_reset_minutes" integer DEFAULT 1440 NOT NULL,
	"min_seconds_between_attempts" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "xp_config_singleton" CHECK ("xp_config"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"threshold" integer NOT NULL,
	"name_de" varchar(80) NOT NULL,
	"name_en" varchar(80) NOT NULL,
	"accent" varchar(24) DEFAULT 'primary' NOT NULL,
	CONSTRAINT "levels_threshold_unique" UNIQUE("threshold")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_punchline_xp" ADD CONSTRAINT "user_punchline_xp_clerk_id_users_clerk_id_fk" FOREIGN KEY ("clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_punchline_xp" ADD CONSTRAINT "user_punchline_xp_punchline_id_punchlines_id_fk" FOREIGN KEY ("punchline_id") REFERENCES "public"."punchlines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_daily_xp" ADD CONSTRAINT "user_daily_xp_clerk_id_users_clerk_id_fk" FOREIGN KEY ("clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_punchline_uq" ON "user_punchline_xp" ("clerk_id","punchline_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_punchline_xp_by_user" ON "user_punchline_xp" ("clerk_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_daily_uq" ON "user_daily_xp" ("clerk_id","date");
--> statement-breakpoint
INSERT INTO "xp_config" ("id") VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Thresholds tuned for ~500-line launch catalog + 1 daily/day.
-- Veteran = full catalog clear. OG = full clear + ~4 months daily grind
-- (or pure-daily-only path of ~15 months). See work/features/p3-xp-system-plan.md
-- for the curve math.
INSERT INTO "levels" ("threshold","name_de","name_en") VALUES
	(0, 'Neuling', 'Rookie'),
	(1000, 'Hörer', 'Listener'),
	(3500, 'Mitläufer', 'Follower'),
	(9000, 'Kenner', 'Connoisseur'),
	(22000, 'Headnodder', 'Headnodder'),
	(50000, 'Reimwächter', 'Bar Guard'),
	(100000, 'Lyricist', 'Lyricist'),
	(175000, 'Punchliner', 'Punchliner'),
	(230000, 'Veteran', 'Veteran'),
	(320000, 'OG', 'OG')
ON CONFLICT DO NOTHING;
