/**
 * Seed the curated "starter" pool (PUN-94). Starter bars seed a brand-new
 * player's opening rounds so the cold-open is an easy, recognizable win
 * (PUN-95). "Easy/iconic" is ultimately an editorial call an admin makes via
 * the bar editor's "Starter bar" toggle — this script just lays down a sensible
 * default so the feature isn't inert: one bar each from the best-known artists
 * (proxied by who has the most playable bars in the DB), preferring reviewed
 * rows, capped at TARGET.
 *
 * Idempotent-ish: it tops the pool up to TARGET and never unflags anything an
 * admin curated. Run: `DATABASE_URL=… pnpm tsx src/seed-starters.ts`.
 */
import { and, eq, inArray, sql } from "drizzle-orm"

import { createDb } from "./index"
import { punchlines } from "./schema"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required")
}

const TARGET = 15
const db = createDb(process.env.DATABASE_URL)

async function main() {
  const [{ count: already }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(punchlines)
    .where(eq(punchlines.starter, true))

  if (already >= TARGET) {
    console.log(`[starters] ${already} already flagged (>= ${TARGET}); nothing to do.`)
    return
  }

  // Are any rows reviewed? If the review queue hasn't been worked yet, don't
  // require it — just take active artist-mode bars.
  const [{ count: reviewedCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(punchlines)
    .where(and(eq(punchlines.active, true), eq(punchlines.reviewed, true)))
  const requireReviewed = reviewedCount >= TARGET

  // One bar per artist, from the artists with the most playable bars (a decent
  // "well-known" proxy), newest bar first. DISTINCT ON keeps one row per artist.
  const reviewedClause = requireReviewed ? sql`and p.reviewed = true` : sql``
  const rows = (await db.execute(sql`
    select picked.id from (
      select distinct on (s.artist_id)
        p.id,
        (select count(*) from punchlines p2
           join songs s2 on s2.id = p2.song_id
          where s2.artist_id = s.artist_id and p2.active) as artist_bars
      from punchlines p
      join songs s on s.id = p.song_id
      where p.active = true and p.starter = false ${reviewedClause}
      order by s.artist_id, p.created_at desc
    ) picked
    order by picked.artist_bars desc
    limit ${TARGET - already}
  `)) as unknown as { rows: Array<{ id: number }> }

  const ids = (rows.rows ?? []).map((r) => Number(r.id)).filter(Boolean)
  if (ids.length === 0) {
    console.log("[starters] no eligible bars found.")
    return
  }

  await db.update(punchlines).set({ starter: true }).where(inArray(punchlines.id, ids))
  console.log(
    `[starters] flagged ${ids.length} bars as starter (was ${already}, reviewed-only=${requireReviewed}). ids: ${ids.join(", ")}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
