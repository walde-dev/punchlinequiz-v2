CREATE TABLE "anon_xp" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"punchline_id" integer NOT NULL,
	"primary_mode" varchar(16) NOT NULL,
	"xp_awarded" integer NOT NULL,
	"song_bonus_awarded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anon_xp_claims" (
	"session_id" varchar(64) PRIMARY KEY NOT NULL,
	"clerk_id" varchar(64) NOT NULL,
	"xp_claimed" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "punchlines" ADD COLUMN "starter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "anon_xp" ADD CONSTRAINT "anon_xp_punchline_id_punchlines_id_fk" FOREIGN KEY ("punchline_id") REFERENCES "public"."punchlines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anon_xp_claims" ADD CONSTRAINT "anon_xp_claims_clerk_id_users_clerk_id_fk" FOREIGN KEY ("clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anon_xp_uq" ON "anon_xp" USING btree ("session_id","punchline_id");--> statement-breakpoint
CREATE INDEX "anon_xp_by_session" ON "anon_xp" USING btree ("session_id");