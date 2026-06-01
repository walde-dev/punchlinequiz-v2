CREATE TABLE "follows" (
	"follower_clerk_id" varchar(64) NOT NULL,
	"followee_clerk_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_clerk_id_followee_clerk_id_pk" PRIMARY KEY("follower_clerk_id","followee_clerk_id"),
	CONSTRAINT "follows_no_self" CHECK ("follows"."follower_clerk_id" <> "follows"."followee_clerk_id")
);
--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_clerk_id_users_clerk_id_fk" FOREIGN KEY ("follower_clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_clerk_id_users_clerk_id_fk" FOREIGN KEY ("followee_clerk_id") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_followee" ON "follows" USING btree ("followee_clerk_id");