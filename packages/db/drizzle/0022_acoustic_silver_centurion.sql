DROP INDEX "challenge_attempt_uq";--> statement-breakpoint
ALTER TABLE "challenge_attempts" ALTER COLUMN "clerk_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ALTER COLUMN "creator_clerk_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_attempts" ADD COLUMN "session_id" varchar(64);--> statement-breakpoint
ALTER TABLE "challenge_attempts" ADD COLUMN "display_name" varchar(40);--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "creator_session_id" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_attempt_clerk_uq" ON "challenge_attempts" USING btree ("challenge_id","clerk_id") WHERE "challenge_attempts"."clerk_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_attempt_session_uq" ON "challenge_attempts" USING btree ("challenge_id","session_id") WHERE "challenge_attempts"."session_id" is not null;