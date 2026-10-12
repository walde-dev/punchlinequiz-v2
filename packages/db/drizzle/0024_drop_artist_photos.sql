-- Artist photos were hotlinked from Deezer's CDN. Many belong to photo
-- agencies (dpa Picture-Alliance sent a damages claim on 2026-10-12 for one of
-- them), so stop showing all of them. The UI falls back to the initials
-- monogram. artwork_external_id stays so the Deezer link is kept.
UPDATE "artists" SET "image_url" = NULL WHERE "image_url" IS NOT NULL;
