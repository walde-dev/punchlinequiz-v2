ALTER TABLE "artists" ADD COLUMN "artwork_provider" varchar(16);--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "artwork_external_id" varchar(32);--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "artwork_provider" varchar(16);--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "artwork_track_id" varchar(32);--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "artwork_album_id" varchar(32);