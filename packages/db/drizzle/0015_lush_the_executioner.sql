CREATE TABLE "contributor_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"clerk_id" varchar(64) NOT NULL,
	"xp_awarded" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "punchlines" ADD COLUMN "submitted_by_clerk_id" varchar(64);--> statement-breakpoint
ALTER TABLE "xp_config" ADD COLUMN "xp_submission_accepted" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "contributor_grants" ADD CONSTRAINT "contributor_grants_submission_id_punchline_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."punchline_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_grants" ADD CONSTRAINT "contributor_grants_clerk_id_users_clerk_id_fk" FOREIGN KEY ("clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contributor_grants_submission_uq" ON "contributor_grants" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "contributor_grants_by_user" ON "contributor_grants" USING btree ("clerk_id","created_at");