CREATE TABLE IF NOT EXISTS "daily_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"punchline_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_challenges_date_unique" UNIQUE("date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_challenges" ADD CONSTRAINT "daily_challenges_punchline_id_punchlines_id_fk" FOREIGN KEY ("punchline_id") REFERENCES "public"."punchlines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
