ALTER TABLE "users" ADD COLUMN "handle" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_key" varchar(40);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_lower_uq" ON "users" USING btree (lower("handle"));--> statement-breakpoint
CREATE INDEX "users_total_xp" ON "users" USING btree ("total_xp");--> statement-breakpoint
CREATE INDEX "user_punchline_xp_created_at" ON "user_punchline_xp" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_daily_xp_created_at" ON "user_daily_xp" USING btree ("created_at");
