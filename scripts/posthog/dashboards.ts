/**
 * PUN-43 — Core launch dashboards, version-controlled.
 *
 * These are the canonical metric definitions. They are applied to PostHog by
 * `scripts/posthog/apply.ts` (idempotent upsert by insight name). Editing a
 * query here + re-running apply updates the live insight — analytics as code.
 *
 * North-star: Weekly Active Players completing >=1 round.
 * Guardrails:  D1/7/30 retention, viral k-factor, sign-up conversion.
 *
 * "Completed a round" = any reveal event (the moment a player resolves a bar).
 */

/** Reveal events that mark a completed round. */
export const ROUND_COMPLETE_EVENTS = [
  "answer_revealed",
  "cloze_revealed",
  "song_guess_revealed",
  "daily_artist_revealed",
  "daily_song_revealed",
] as const

type Insight = {
  /** Stable name — used as the idempotency key by apply.ts. */
  name: string
  description: string
  /** PostHog query node (InsightVizNode wraps viz queries; DataTableNode wraps HogQL). */
  query: Record<string, unknown>
}

const last90 = { date_from: "-90d" }

/** HogQL helper -> a saved-query insight. */
function hogql(name: string, description: string, query: string): Insight {
  return {
    name,
    description,
    query: { kind: "DataTableNode", source: { kind: "HogQLQuery", query } },
  }
}

export const INSIGHTS: Insight[] = [
  // ── NORTH STAR ────────────────────────────────────────────────────────────
  hogql(
    "★ North Star — Weekly Active Players (completed ≥1 round)",
    "Distinct players who completed at least one round each week.",
    `SELECT toStartOfWeek(timestamp) AS week,
        count(DISTINCT person_id) AS weekly_active_players
     FROM events
     WHERE event IN (${ROUND_COMPLETE_EVENTS.map((e) => `'${e}'`).join(", ")})
       AND timestamp >= now() - INTERVAL 90 DAY
     GROUP BY week
     ORDER BY week`,
  ),

  // ── ACQUISITION FUNNEL ────────────────────────────────────────────────────
  {
    name: "Acquisition funnel — land → first answer → 2nd round → sign-up",
    description: "Core activation funnel for new visitors.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        dateRange: last90,
        series: [
          { kind: "EventsNode", event: "$pageview", name: "Landed" },
          { kind: "EventsNode", event: "round_started", name: "First round" },
          { kind: "EventsNode", event: "answer_revealed", name: "Answered" },
          { kind: "EventsNode", event: "handle_claimed", name: "Signed up" },
        ],
        funnelsFilter: { funnelVizType: "steps", funnelWindowInterval: 1, funnelWindowIntervalUnit: "day" },
      },
    },
  },

  // ── RETENTION D1/D7/D30 ───────────────────────────────────────────────────
  {
    name: "Retention — return & complete a round",
    description: "D1/D7/D30 retention; cohort = first round, returning = any round complete.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "RetentionQuery",
        dateRange: last90,
        retentionFilter: {
          period: "Day",
          totalIntervals: 31,
          targetEntity: { id: "round_started", name: "round_started", type: "events" },
          returningEntity: { id: "round_started", name: "round_started", type: "events" },
          retentionType: "retention_first_time",
        },
      },
    },
  },

  // ── VIRALITY / K-FACTOR ───────────────────────────────────────────────────
  {
    name: "Virality funnel — share/invite → landing → sign-up",
    description: "Distribution loop: a share or invite that lands a visitor who then signs up.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        dateRange: last90,
        series: [
          { kind: "EventsNode", event: "referral_link_shared", name: "Invite shared" },
          { kind: "EventsNode", event: "referral_landing_viewed", name: "Invite landed" },
          { kind: "EventsNode", event: "handle_claimed", name: "New sign-up" },
        ],
        funnelsFilter: { funnelVizType: "steps", funnelWindowInterval: 14, funnelWindowIntervalUnit: "day" },
      },
    },
  },
  hogql(
    "k-factor (proxy) — invited sign-ups per inviter, weekly",
    "Referral-confirmed sign-ups divided by distinct inviters who shared. >1 = viral.",
    `SELECT toStartOfWeek(timestamp) AS week,
        countIf(event = 'handle_claimed' AND properties.referred = true) AS invited_signups,
        count(DISTINCT if(event = 'referral_link_shared', person_id, NULL)) AS inviters,
        round(invited_signups / nullIf(inviters, 0), 2) AS k_factor
     FROM events
     WHERE event IN ('handle_claimed', 'referral_link_shared')
       AND timestamp >= now() - INTERVAL 90 DAY
     GROUP BY week
     ORDER BY week`,
  ),

  // ── ENGAGEMENT ────────────────────────────────────────────────────────────
  {
    name: "Engagement — daily completion & participation (DAU/WAU)",
    description: "Daily opens, rounds completed, challenge & leaderboard participation.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        dateRange: last90,
        interval: "day",
        series: [
          { kind: "EventsNode", event: "daily_opened", name: "Daily opened", math: "dau" },
          { kind: "EventsNode", event: "session_completed", name: "Sessions completed", math: "total" },
          { kind: "EventsNode", event: "challenge_play_started", name: "Challenges played", math: "total" },
          { kind: "EventsNode", event: "leaderboard_viewed", name: "Leaderboard views", math: "dau" },
        ],
      },
    },
  },
  // ── RETENTION WATCH (PUN-120) ─────────────────────────────────────────────
  hogql(
    "Retention watch — D1/D7 by cohort day (anon floor)",
    "Per-day cohorts (first play) with D1/D7 return rates. Definition mirrors the " +
      "canonical DB query in apps/web/src/lib/retention.ts. Anon-session based = a " +
      "FLOOR; signed-in retention is higher.",
    `WITH activity AS (
        SELECT person_id, toDate(timestamp) AS day
        FROM events
        WHERE event IN ('round_started', 'daily_opened')
          AND timestamp >= now() - INTERVAL 30 DAY
        GROUP BY person_id, day
      ),
      cohort AS (
        SELECT person_id, min(day) AS cohort_day FROM activity GROUP BY person_id
      )
      SELECT c.cohort_day AS cohort,
        count(DISTINCT c.person_id) AS size,
        round(100 * count(DISTINCT if(a.day = c.cohort_day + 1, c.person_id, NULL))
          / nullIf(count(DISTINCT c.person_id), 0), 0) AS d1_pct,
        round(100 * count(DISTINCT if(a.day > c.cohort_day AND a.day <= c.cohort_day + 7, c.person_id, NULL))
          / nullIf(count(DISTINCT c.person_id), 0), 0) AS d7_pct
      FROM cohort c
      JOIN activity a ON a.person_id = c.person_id
      GROUP BY c.cohort_day
      ORDER BY c.cohort_day DESC`,
  ),

  hogql(
    "Sign-up conversion — guardrail",
    "Share of distinct players who reach handle_claimed.",
    `SELECT
        count(DISTINCT person_id) AS players,
        count(DISTINCT if(event = 'handle_claimed', person_id, NULL)) AS signed_up,
        round(signed_up / nullIf(players, 0) * 100, 1) AS signup_rate_pct
     FROM events
     WHERE timestamp >= now() - INTERVAL 90 DAY`,
  ),
]

export const DASHBOARD = {
  name: "Launch — Acquisition · Retention · Virality",
  description:
    "PUN-43 launch decision dashboard. North-star + guardrails. Defined in scripts/posthog/dashboards.ts.",
}
