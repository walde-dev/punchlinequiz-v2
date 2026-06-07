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
    description:
      "Core activation funnel for new visitors. Step 1 is `session_started` " +
      "(fired once per tab at landing, __root.tsx), NOT `$pageview` — pageviews " +
      "are badly undercounted in this SPA (game served at `/`, few route changes) " +
      "so they made a garbage top-of-funnel. See docs/logging-observability.md.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        dateRange: last90,
        series: [
          { kind: "EventsNode", event: "session_started", name: "Landed" },
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
    description:
      "Recipient side of the Challenge loop (the real distribution bet — the old " +
      "broadcast `referral_*`/`share_*` events are dormant, ~0 fires). Per-person " +
      "funnel for someone who opens a shared challenge link, plays it, and signs up. " +
      "(The creator side is captured by k-factor below.)",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        dateRange: last90,
        series: [
          { kind: "EventsNode", event: "challenge_link_opened", name: "Opened challenge" },
          { kind: "EventsNode", event: "challenge_play_completed", name: "Played it" },
          { kind: "EventsNode", event: "challenge_signup_claimed", name: "Signed up" },
        ],
        funnelsFilter: { funnelVizType: "steps", funnelWindowInterval: 14, funnelWindowIntervalUnit: "day" },
      },
    },
  },
  hogql(
    "k-factor (proxy) — invited sign-ups per inviter, weekly",
    "Challenge-driven sign-ups (challenge_signup_claimed) divided by distinct " +
      "challenge creators that week. >1 = viral. Replaces the old referral_* proxy, " +
      "which read ~0 because broadcast sharing is dormant.",
    `SELECT toStartOfWeek(timestamp) AS week,
        countIf(event = 'challenge_signup_claimed') AS invited_signups,
        count(DISTINCT if(event = 'challenge_created', person_id, NULL)) AS inviters,
        round(invited_signups / nullIf(inviters, 0), 2) AS k_factor
     FROM events
     WHERE event IN ('challenge_signup_claimed', 'challenge_created')
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
          { kind: "EventsNode", event: "challenge_play_completed", name: "Challenges played", math: "total" },
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

  // ── SHARE-CARD HEALTH (PUN-122) ───────────────────────────────────────────
  hogql(
    "Share-card render health — completions vs cards rendered",
    "Weekly: session completions vs successful/failed share-card renders, and the " +
      "render rate. The share card is the growth engine, so a falling render_pct is " +
      "a distribution leak. NOTE: before ~2026-06-07 `card_render_succeeded` was " +
      "dropped when the summary unmounted before the render resolved, so render_pct " +
      "is artificially ~50% pre-fix and step-changes upward after.",
    `SELECT toStartOfWeek(timestamp) AS week,
        countIf(event = 'session_completed') AS completions,
        countIf(event = 'card_render_succeeded') AS rendered,
        countIf(event = 'card_render_failed') AS failed,
        round(100 * rendered / nullIf(completions, 0), 0) AS render_pct
     FROM events
     WHERE event IN ('session_completed', 'card_render_succeeded', 'card_render_failed')
       AND timestamp >= now() - INTERVAL 90 DAY
     GROUP BY week
     ORDER BY week`,
  ),

  // ── SIGN-UP PROMPT CONVERSION ─────────────────────────────────────────────
  hogql(
    "Sign-up prompt conversion — by surface",
    "Distinct sessions shown vs clicked, split by prompt surface (pill | gate | " +
      "session_complete). Counted by DISTINCT person, not raw events: the pill/gate " +
      "re-emit `signup_prompt_shown` once per mount (~2×/session), so raw impression " +
      "counts overstate reach.",
    `SELECT properties.source AS surface,
        count(DISTINCT if(event = 'signup_prompt_shown', person_id, NULL)) AS shown,
        count(DISTINCT if(event = 'signup_prompt_clicked', person_id, NULL)) AS clicked,
        round(100 * clicked / nullIf(shown, 0), 1) AS click_pct
     FROM events
     WHERE event IN ('signup_prompt_shown', 'signup_prompt_clicked')
       AND timestamp >= now() - INTERVAL 90 DAY
     GROUP BY surface
     ORDER BY shown DESC`,
  ),
]

export const DASHBOARD = {
  name: "Launch — Acquisition · Retention · Virality",
  description:
    "PUN-43 launch decision dashboard. North-star + guardrails. Defined in scripts/posthog/dashboards.ts.",
}
