import { sql } from "drizzle-orm"

import { db } from "./db"

/**
 * Launch-cohort retention watch (PUN-120). Canonical computation over the
 * adblock-proof `game_events` log. A cohort = anon sessions whose first
 * qualifying play happened on a given UTC day; "returning" = the same session
 * does a `round_started` OR `daily_opened` on a LATER calendar day.
 *
 * This is a FLOOR: the anon `session_id` lives in localStorage, so a cache-clear
 * or new device reads as a new session. Signed-in retention (post PUN-118) is the
 * true number. Always state that caveat where this is surfaced.
 */

/** Play signals that define both cohort entry and a return visit. */
const QUALIFYING = ["round_started", "daily_opened"] as const

export type RetentionRow = {
  cohortDay: string // YYYY-MM-DD (UTC)
  cohortSize: number
  d1: number
  d7: number
  /** d1 / cohortSize, or null until the D1 window has elapsed. */
  d1Rate: number | null
  /** d7 / cohortSize, or null until at least one day has elapsed. */
  d7Rate: number | null
}

async function rawRows<T>(query: ReturnType<typeof sql>): Promise<Array<T>> {
  const res = (await db.execute(query)) as unknown as { rows?: Array<T> } | Array<T>
  return Array.isArray(res) ? res : (res.rows ?? [])
}

/**
 * D1/D7 retention for each cohort day in the trailing `days` window (default 14).
 * Returns newest cohort first. Rates are null while the measurement window for
 * that cohort hasn't fully elapsed (e.g. today's D1 isn't knowable until tomorrow).
 */
export async function computeRetention(days = 14): Promise<Array<RetentionRow>> {
  const names = sql.join(
    QUALIFYING.map((n) => sql`${n}`),
    sql`, `
  )
  const rows = await rawRows<{
    cohort_day: string
    cohort_size: number
    d1: number
    d7: number
    cohort_age_days: number
  }>(sql`
    WITH activity AS (
      SELECT session_id, (created_at AT TIME ZONE 'UTC')::date AS day
      FROM game_events
      WHERE name IN (${names})
      GROUP BY session_id, day
    ),
    cohort AS (
      SELECT session_id, MIN(day) AS cohort_day FROM activity GROUP BY session_id
    )
    SELECT
      to_char(c.cohort_day, 'YYYY-MM-DD') AS cohort_day,
      count(DISTINCT c.session_id)::int AS cohort_size,
      count(DISTINCT c.session_id) FILTER (WHERE a.day = c.cohort_day + 1)::int AS d1,
      count(DISTINCT c.session_id) FILTER (
        WHERE a.day > c.cohort_day AND a.day <= c.cohort_day + 7
      )::int AS d7,
      ((now() AT TIME ZONE 'UTC')::date - c.cohort_day)::int AS cohort_age_days
    FROM cohort c
    JOIN activity a ON a.session_id = c.session_id
    WHERE c.cohort_day >= (now() AT TIME ZONE 'UTC')::date - ${`${days} days`}::interval
    GROUP BY c.cohort_day
    ORDER BY c.cohort_day DESC
  `)

  return rows.map((r) => {
    const size = Number(r.cohort_size)
    const age = Number(r.cohort_age_days)
    return {
      cohortDay: r.cohort_day,
      cohortSize: size,
      d1: Number(r.d1),
      d7: Number(r.d7),
      // D1 needs ≥1 day elapsed; D7 matures over 7 but show a rolling rate after day 1.
      d1Rate: age >= 1 && size > 0 ? Number(r.d1) / size : null,
      d7Rate: age >= 1 && size > 0 ? Number(r.d7) / size : null,
    }
  })
}

/** Format the retention rows as a Discord message (monospace table). */
export function formatRetentionMessage(rows: Array<RetentionRow>): string {
  const pct = (v: number | null) => (v === null ? "  –  " : `${(v * 100).toFixed(0).padStart(3)}%`)
  const lines = rows.map(
    (r) =>
      `${r.cohortDay}  n=${String(r.cohortSize).padStart(4)}  D1 ${pct(r.d1Rate)}  D7 ${pct(r.d7Rate)}`
  )
  return [
    "**📈 Retention watch** (anon sessions — a FLOOR; signed-in is higher)",
    "```",
    "cohort      size    D1     D7",
    ...lines,
    "```",
  ].join("\n")
}
