CREATE TABLE "anon_referral_codes" (
	"code" varchar(16) PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_anon_referrals" (
	"referee_clerk_id" varchar(64) PRIMARY KEY NOT NULL,
	"referrer_session_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_anon_referrals" ADD CONSTRAINT "pending_anon_referrals_referee_clerk_id_users_clerk_id_fk" FOREIGN KEY ("referee_clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anon_referral_codes_session_uq" ON "anon_referral_codes" USING btree ("session_id");