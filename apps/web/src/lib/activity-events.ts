/**
 * Presentation layer for the admin activity log.
 *
 * The `game_events` table is the single source of truth — every discrete user
 * (and admin) action lands there. This module turns a raw event row into a
 * human-readable, Linear-style line ("@nas hat den Artist erkannt · vor 2 Std")
 * and assigns it a category for filtering + the glyph shown beside it.
 *
 * Pure + side-effect free (no DB, no server imports) so it can be imported on
 * both the client (rendering) and the server (category → SQL filtering).
 */

// ─── Categories ───────────────────────────────────────────────────────────────

export type CategoryKey =
  | "play"
  | "daily"
  | "submission"
  | "account"
  | "referral"
  | "challenge"
  | "leaderboard"
  | "quiz"
  | "distribution"
  | "admin"
  | "other"

export type CategoryMeta = { key: CategoryKey; label: string; glyph: string }

/** Filter pills, in display order. "Alles" (no filter) is added by the UI. */
export const CATEGORIES: Array<CategoryMeta> = [
  { key: "play", label: "Spiel", glyph: "♪" },
  { key: "daily", label: "Daily", glyph: "★" },
  { key: "submission", label: "Einreichungen", glyph: "✎" },
  { key: "account", label: "Accounts", glyph: "✦" },
  { key: "referral", label: "Referrals", glyph: "↗" },
  { key: "challenge", label: "Challenges", glyph: "◆" },
  { key: "leaderboard", label: "Rangliste", glyph: "▲" },
  { key: "quiz", label: "Quiz", glyph: "◇" },
  { key: "distribution", label: "Shares", glyph: "⇪" },
  { key: "admin", label: "Admin", glyph: "⚙" },
  { key: "other", label: "Sonstige", glyph: "•" },
]

export const CATEGORY_LABEL: Record<CategoryKey, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
) as Record<CategoryKey, string>

export const CATEGORY_GLYPH: Record<CategoryKey, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.glyph]),
) as Record<CategoryKey, string>

// Positive name-sets for categories that aren't a clean prefix. Shared with the
// server so DB filtering and client grouping agree on the same buckets.
export const PLAY_NAMES = [
  "round_started",
  "answer_selected",
  "answer_revealed",
  "answer_failed",
  "cloze_submitted",
  "cloze_revealed",
  "cloze_failed",
  "song_guess_submitted",
  "song_guess_revealed",
  "song_guess_failed",
  "next_clicked",
  "next_failed",
  "early_win",
  "explainer_dismissed",
  "play_opened",
  "first_run_started",
  "session_restart_clicked",
  "session_restart_failed",
  "session_completed",
] as const

export const SUBMISSION_NAMES = [
  "bar_submitted",
  "submission_created",
  "submission_rate_limited",
  "submissions_viewed",
  "acceptance_seen",
] as const

export const ACCOUNT_NAMES = [
  "handle_claimed",
  "xp_claimed",
  "signup_prompt_shown",
  "signup_prompt_clicked",
] as const

export const DISTRIBUTION_NAMES = ["share_clicked", "discord_click"] as const

const PLAY_SET: ReadonlySet<string> = new Set(PLAY_NAMES)
const SUBMISSION_SET: ReadonlySet<string> = new Set(SUBMISSION_NAMES)
const ACCOUNT_SET: ReadonlySet<string> = new Set(ACCOUNT_NAMES)
const DISTRIBUTION_SET: ReadonlySet<string> = new Set(DISTRIBUTION_NAMES)

/**
 * Single category for an event name — used for the row glyph and for grouping
 * in the unfiltered "Alles" view. Priority order matters (admin prefix wins,
 * daily prefix before its share variant, etc.).
 */
export function categoryFor(name: string): CategoryKey {
  if (name.startsWith("admin_")) return "admin"
  if (name.startsWith("daily_")) return "daily"
  if (name.startsWith("challenge_")) return "challenge"
  if (name.startsWith("referral_")) return "referral"
  if (name.startsWith("quiz_")) return "quiz"
  if (name.startsWith("leaderboard_") || name === "contributor_leaderboard_viewed")
    return "leaderboard"
  if (DISTRIBUTION_SET.has(name)) return "distribution"
  if (ACCOUNT_SET.has(name)) return "account"
  if (SUBMISSION_SET.has(name)) return "submission"
  if (name === "profile_viewed") return "other"
  if (PLAY_SET.has(name)) return "play"
  return "other"
}

// ─── Prop coercion (props is untyped JSON) ──────────────────────────────────────

function n(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}
function b(v: unknown): boolean {
  return v === true || v === "true"
}

// ─── Sentence templates ─────────────────────────────────────────────────────────

type Props = Record<string, unknown>
type Describe = (p: Props) => string

/**
 * Maps an event name to the German predicate shown after the actor name. Keep
 * these casual-neutral and short — this is an internal admin feed. Unknown
 * events fall back to a humanized form (see `describeEvent`).
 */
const TEMPLATES: Record<string, Describe> = {
  // play
  round_started: () => "hat eine Runde gestartet",
  answer_selected: () => "hat einen Artist getippt",
  answer_revealed: (p) => (b(p.correct) ? "hat den Artist erkannt" : "lag beim Artist daneben"),
  answer_failed: () => "konnte den Artist nicht lösen",
  cloze_submitted: () => "hat den Lückentext getippt",
  cloze_revealed: (p) => (b(p.correct) ? "hat den Lückentext gelöst" : "hat den Lückentext aufgelöst"),
  cloze_failed: () => "ist am Lückentext gescheitert",
  song_guess_submitted: () => "hat den Song getippt",
  song_guess_revealed: (p) =>
    b(p.skipped)
      ? "hat den Song übersprungen"
      : b(p.correct)
        ? "hat den Song erkannt"
        : "lag beim Song daneben",
  song_guess_failed: () => "konnte den Song nicht lösen",
  next_clicked: () => "ist zur nächsten Bar",
  early_win: () => "hat früh gewonnen",
  explainer_dismissed: () => "hat die Erklärung geschlossen",
  play_opened: () => "hat das Spiel geöffnet",
  first_run_started: () => "hat den ersten Run gestartet",
  session_restart_clicked: () => "hat die Session neu gestartet",
  session_completed: (p) => {
    const c = n(p.correct)
    const t = n(p.total)
    return c !== null && t !== null
      ? `hat eine Session beendet (${c}/${t})`
      : "hat eine Session beendet"
  },

  // daily
  daily_opened: () => "hat das Daily geöffnet",
  daily_artist_submitted: () => "hat den Daily-Artist getippt",
  daily_artist_revealed: (p) =>
    b(p.correct) ? "hat den Daily-Artist erkannt" : "lag beim Daily-Artist daneben",
  daily_song_submitted: () => "hat den Daily-Song getippt",
  daily_song_revealed: (p) =>
    b(p.correct) ? "hat den Daily-Song erkannt" : "lag beim Daily-Song daneben",
  daily_share_clicked: () => "hat das Daily geteilt",

  // submission
  bar_submitted: () => "hat eine Bar eingereicht",
  submission_created: () => "hat eine Bar eingereicht",
  submission_rate_limited: () => "wurde beim Einreichen ausgebremst",
  submissions_viewed: () => "hat seine Einreichungen angesehen",
  acceptance_seen: () => "hat eine angenommene Einreichung gesehen",

  // account
  handle_claimed: (p) => {
    const h = s(p.handle)
    return h ? `hat den Handle @${h} gewählt` : "hat einen Handle gewählt"
  },
  xp_claimed: (p) => {
    const xp = n(p.xp)
    return xp !== null ? `hat ${xp} XP übernommen` : "hat XP übernommen"
  },
  signup_prompt_shown: () => "hat den Signup-Prompt gesehen",
  signup_prompt_clicked: () => "hat den Signup-Prompt geklickt",

  // referral
  referral_landing_viewed: () => "kam über einen Referral-Link",
  referral_confirmation_seen: () => "hat die Referral-Bestätigung gesehen",
  referral_link_copied: () => "hat den Referral-Link kopiert",
  referral_link_shared: () => "hat den Referral-Link geteilt",

  // challenge
  challenge_created: () => "hat eine Challenge erstellt",
  challenge_play_started: () => "hat eine Challenge gestartet",
  challenge_play_completed: () => "hat eine Challenge beendet",
  challenge_signup_claimed: () => "hat sich über eine Challenge angemeldet",
  challenge_board_viewed: () => "hat ein Challenge-Board angesehen",
  challenge_shared: () => "hat eine Challenge geteilt",

  // leaderboard
  leaderboard_viewed: () => "hat die Rangliste angesehen",
  contributor_leaderboard_viewed: () => "hat die Contributor-Rangliste angesehen",
  leaderboard_profile_click: () => "hat ein Profil aus der Rangliste geöffnet",

  // quiz
  quiz_start_clicked: () => "hat einen Artist-Quiz geöffnet",
  quiz_started: () => "hat ein Quiz begonnen",
  quiz_artist_cleared: () => "hat einen Artist komplett gelöst",

  // distribution
  share_clicked: () => "hat geteilt",
  discord_click: () => "hat auf Discord geklickt",

  // misc
  profile_viewed: () => "hat ein Profil angesehen",

  // admin (actor is an admin)
  admin_edit_bar: (p) => `hat Bar #${n(p.id) ?? "?"} bearbeitet`,
  admin_delete_bar: (p) =>
    b(p.hard) ? `hat Bar #${n(p.id) ?? "?"} endgültig gelöscht` : `hat Bar #${n(p.id) ?? "?"} deaktiviert`,
  admin_edit_artist: (p) => `hat Artist #${n(p.id) ?? "?"} bearbeitet`,
  admin_edit_song: (p) => `hat Song #${n(p.id) ?? "?"} bearbeitet`,
  admin_review_submission: (p) =>
    s(p.action) === "approve" ? "hat eine Einreichung angenommen" : "hat eine Einreichung abgelehnt",
  admin_create_tag: (p) => {
    const slug = s(p.slug)
    return slug ? `hat den Tag „${slug}" erstellt` : "hat einen Tag erstellt"
  },
  admin_set_artist_tags: () => "hat die Tags eines Artists gesetzt",
  admin_xp_config_update: () => "hat die XP-Konfiguration geändert",
  admin_schedule_daily: (p) => {
    const date = s(p.date)
    return date ? `hat das Daily für ${date} geplant` : "hat ein Daily geplant"
  },
  admin_unschedule_daily: () => "hat ein Daily entfernt",
  admin_levels_replace: () => "hat die Level-Schwellen aktualisiert",
}

/** Title-cases an unknown event name: `early_win` → `Early win`. */
function humanize(name: string): string {
  const cleaned = name.replace(/^admin_/, "").replace(/_/g, " ").trim()
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : name
}

/**
 * The predicate that follows the actor name. Known events get a hand-written
 * sentence; unknown ones get a humanized fallback so nothing is ever hidden.
 */
export function describeEvent(name: string, props: Props): string {
  const tpl = TEMPLATES[name]
  if (tpl) {
    try {
      return tpl(props)
    } catch {
      // Defensive: a malformed prop should never blank the whole feed.
    }
  }
  return `– ${humanize(name)}`
}
