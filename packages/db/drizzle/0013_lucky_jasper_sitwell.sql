CREATE TABLE "challenge_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" integer NOT NULL,
	"clerk_id" varchar(64) NOT NULL,
	"correct_count" integer NOT NULL,
	"solve_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(16) NOT NULL,
	"creator_clerk_id" varchar(64) NOT NULL,
	"bar_ids" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_clerk_id_users_clerk_id_fk" FOREIGN KEY ("clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_clerk_id_users_clerk_id_fk" FOREIGN KEY ("creator_clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_attempt_uq" ON "challenge_attempts" USING btree ("challenge_id","clerk_id");--> statement-breakpoint
CREATE INDEX "challenge_attempt_by_challenge" ON "challenge_attempts" USING btree ("challenge_id");