CREATE TABLE "user_answer_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" varchar(64) NOT NULL,
	"punchline_id" integer NOT NULL,
	"kind" varchar(16) NOT NULL,
	"correct" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_rate_limits" (
	"clerk_id" varchar(64) PRIMARY KEY NOT NULL,
	"last_submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_answer_attempts" ADD CONSTRAINT "user_answer_attempts_clerk_id_users_clerk_id_fk" FOREIGN KEY ("clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_answer_attempts" ADD CONSTRAINT "user_answer_attempts_punchline_id_punchlines_id_fk" FOREIGN KEY ("punchline_id") REFERENCES "public"."punchlines"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "submission_rate_limits" ADD CONSTRAINT "submission_rate_limits_clerk_id_users_clerk_id_fk" FOREIGN KEY ("clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_answer_attempts_uq" ON "user_answer_attempts" USING btree ("clerk_id","punchline_id","kind");
--> statement-breakpoint
CREATE INDEX "user_answer_attempts_by_user" ON "user_answer_attempts" USING btree ("clerk_id","created_at");
