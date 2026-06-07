CREATE TABLE "ingest_episodes" (
	"video_id" varchar(16) PRIMARY KEY NOT NULL,
	"title" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" varchar(16) NOT NULL,
	"punchline_id" integer,
	"item_index" integer NOT NULL,
	"ts_ms" integer,
	"model" varchar(48),
	"confidence" double precision,
	"status" varchar(16) NOT NULL,
	"dedupe_of_punchline_id" integer,
	"raw_extraction" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_video_id_ingest_episodes_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."ingest_episodes"("video_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_punchline_id_punchlines_id_fk" FOREIGN KEY ("punchline_id") REFERENCES "public"."punchlines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_dedupe_of_punchline_id_punchlines_id_fk" FOREIGN KEY ("dedupe_of_punchline_id") REFERENCES "public"."punchlines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_episodes_status" ON "ingest_episodes" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "ingest_items_video" ON "ingest_items" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "ingest_items_punchline" ON "ingest_items" USING btree ("punchline_id");