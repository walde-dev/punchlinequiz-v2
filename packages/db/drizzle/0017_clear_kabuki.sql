CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_clerk_id" varchar(64) NOT NULL,
	"referee_clerk_id" varchar(64) NOT NULL,
	"source" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"referrer_xp" integer DEFAULT 0 NOT NULL,
	"referee_xp" integer DEFAULT 0 NOT NULL,
	"seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "xp_config" ADD COLUMN "xp_referral_referrer" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "xp_config" ADD COLUMN "xp_referral_referee" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "xp_config" ADD COLUMN "referral_daily_cap" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_clerk_id_users_clerk_id_fk" FOREIGN KEY ("referrer_clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_clerk_id_users_clerk_id_fk" FOREIGN KEY ("referee_clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referee_uq" ON "referrals" USING btree ("referee_clerk_id");--> statement-breakpoint
CREATE INDEX "referrals_by_referrer" ON "referrals" USING btree ("referrer_clerk_id","status");