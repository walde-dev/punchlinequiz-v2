CREATE TABLE "game_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"name" varchar(80) NOT NULL,
	"props" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "punchlines" ALTER COLUMN "perfect_solution" SET DEFAULT '[]'::json;