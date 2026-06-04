import { sql } from "drizzle-orm"
import { dailyChallenges } from "@workspace/db"

/**
 * Daily-exclusive bar lifecycle (PUN-104).
 *
 * A daily bar is exclusive to /daily on its date — it is withheld from the
 * general random pool while it is the daily for today or a future date, and is
 * released back into the pool only once its date has passed. This keeps the
 * daily a single shared bar for everyone (so a signed-in player can't have
 * pre-solved today's daily elsewhere, which would collide with the solved-bar
 * exclusion in PUN-103) without permanently burning the bar from normal play.
 */

/** Today's date in Europe/Berlin (CET/CEST) as YYYY-MM-DD — matches the daily key. */
export function todayCET(): string {
  // sv-SE formats as YYYY-MM-DD; Europe/Berlin matches how dailies are scheduled.
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
}

/**
 * Subquery of punchline ids that must stay OUT of the general random pool:
 * bars scheduled as a daily for TODAY or any FUTURE date. Past dailies are
 * deliberately released (date < today no longer matches) so they become
 * normally playable again — still subject to the per-user solved exclusion.
 *
 * Shared by getRound (cold-open + /quiz), the artist picker counts, and
 * challenge creation so the lifecycle rule stays consistent everywhere.
 */
export function hiddenDailyIds() {
  return sql`(SELECT ${dailyChallenges.punchlineId} FROM ${dailyChallenges} WHERE ${dailyChallenges.date} >= ${todayCET()})`
}
