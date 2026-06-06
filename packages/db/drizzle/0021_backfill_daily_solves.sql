-- Data backfill: credit already-solved daily bars toward completion.
--
-- Until now, solving a daily wrote only user_daily_xp, never user_punchline_xp,
-- so daily solves never counted on the completion board / profile lines-solved
-- (players like @Urus showed e.g. 298/300 despite having aced those bars). The
-- code now mirrors a zero-XP user_punchline_xp row on every correct daily solve;
-- this catches up every PAST correct solve the same way.
--
-- xp_awarded = 0 on purpose: the daily XP is already in user_daily_xp + total_xp,
-- and the weekly/friends boards UNION both ledgers, so a non-zero value would
-- double-count. created_at carries the original daily-solve time so profile
-- ordering stays truthful. ON CONFLICT DO NOTHING preserves any real /play row
-- (xp > 0) the player may already have for the same bar.
INSERT INTO "user_punchline_xp" ("clerk_id", "punchline_id", "primary_mode", "xp_awarded", "streak_at_award", "created_at")
SELECT ud."clerk_id", dc."punchline_id", 'artist', 0, ud."streak_at_award", ud."created_at"
FROM "user_daily_xp" ud
JOIN "daily_challenges" dc ON dc."date" = ud."date"
WHERE ud."artist_correct" = true
ON CONFLICT ("clerk_id", "punchline_id") DO NOTHING;
