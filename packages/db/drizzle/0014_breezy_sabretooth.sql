CREATE TABLE "punchline_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"submitter_clerk_id" varchar(64) NOT NULL,
	"line" text NOT NULL,
	"cloze_prompt" text,
	"perfect_solution" json,
	"artist_hint" text,
	"song_hint" text,
	"note" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_punchline_id" integer,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "punchline_submissions" ADD CONSTRAINT "punchline_submissions_submitter_clerk_id_users_clerk_id_fk" FOREIGN KEY ("submitter_clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchline_submissions" ADD CONSTRAINT "punchline_submissions_created_punchline_id_punchlines_id_fk" FOREIGN KEY ("created_punchline_id") REFERENCES "public"."punchlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "punchline_submissions_status" ON "punchline_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "punchline_submissions_submitter" ON "punchline_submissions" USING btree ("submitter_clerk_id");