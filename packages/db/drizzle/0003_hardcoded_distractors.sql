ALTER TABLE "punchlines" ADD COLUMN "distractor1_id" integer;--> statement-breakpoint
ALTER TABLE "punchlines" ADD COLUMN "distractor2_id" integer;--> statement-breakpoint
UPDATE "punchlines" p SET
  "distractor1_id" = sub.arr[1],
  "distractor2_id" = sub.arr[2]
FROM (
  SELECT p2."id" AS pid,
    ARRAY(
      SELECT a."id" FROM "artists" a
      WHERE a."active" = true AND a."id" <> s."artist_id"
      ORDER BY random()
      LIMIT 2
    ) AS arr
  FROM "punchlines" p2
  JOIN "songs" s ON s."id" = p2."song_id"
) sub
WHERE p."id" = sub.pid;--> statement-breakpoint
ALTER TABLE "punchlines" ALTER COLUMN "distractor1_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "punchlines" ALTER COLUMN "distractor2_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "punchlines" ADD CONSTRAINT "punchlines_distractor1_id_artists_id_fk" FOREIGN KEY ("distractor1_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlines" ADD CONSTRAINT "punchlines_distractor2_id_artists_id_fk" FOREIGN KEY ("distractor2_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;
