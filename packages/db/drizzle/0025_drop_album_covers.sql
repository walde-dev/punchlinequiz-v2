-- Album covers were hotlinked from Deezer's CDN, same as the artist photos
-- 0024 removed. Covers belong to labels and photographers, so stop showing
-- them too. The UI falls back to the title monogram. artwork_track_id and
-- artwork_album_id stay so the Deezer link is kept.
UPDATE "songs" SET "album_art_url" = NULL WHERE "album_art_url" IS NOT NULL;
--> statement-breakpoint
UPDATE "artists" SET "image_url" = NULL WHERE "image_url" IS NOT NULL;
