# Event Taxonomy (PostHog) — canonical schema

PUN-41. This is the single source of truth for product-analytics event names and
their properties. Every user action is one structured event (see the
aggressive-logging rule in `CLAUDE.md`).

## Conventions

- **Naming: `object_action`, past tense** — `share_clicked`, `challenge_created`,
  `leaderboard_viewed`. (The CLAUDE.md shorthand "verb_noun" is realised as this
  Object-Action form, matching PostHog/Segment standards and the PUN-41 ticket
  examples `punchline_viewed` / `guess_submitted` / `round_completed`.)
- **Props: `snake_case`** — `punchline_id`, `daily_date`, `artist_id`.
- **`session_id` + `timestamp`**: PostHog attaches the distinct id (bootstrapped
  from `pq.session_id`) and server timestamp automatically. The legacy
  DB/Axiom path (`recordEvent`) still stamps both explicitly.
- **PII**: identifiable info (email/name) lives on the **person profile** via
  `identify()` (PUN-42), NOT in event props. Event props stay behavioural.

## Pipeline

`logEvent(name, props)` (client) is the single choke point — it fires:
1. `posthog.capture()` (product analytics), and
2. `recordEvent` server fn → `gameEvents` DB row + Axiom (raw backup + audit).

Genuinely server-originated events use `capturePostHogServer(distinctId, …)`.

## Events

### Acquisition / landing
| event | props |
|---|---|
| `$pageview` / `$pageleave` | auto (PostHog) — powers funnels/retention/paths |
| `referral_landing_viewed` | `source`, `handle` |

### Game (play)
| event | props |
|---|---|
| `play_opened` | — |
| `round_started` | round context |
| `answer_selected` | artist guess |
| `answer_revealed` | result |
| `answer_failed` | `punchline_id`, `message` |
| `cloze_submitted` / `cloze_revealed` | guess / result |
| `cloze_failed` | `punchline_id`, `message` |
| `song_guess_submitted` / `song_guess_revealed` | guess / result |
| `song_guess_failed` | `punchline_id`, `message` |
| `next_clicked` | `punchline_id` |
| `next_failed` | `message` |
| `session_restart_clicked` | — |
| `session_restart_failed` | `message` |
| `session_completed` | session stats |

### Daily
| event | props |
|---|---|
| `daily_opened` | `daily_date` |
| `daily_artist_submitted` / `daily_artist_revealed` | guess / result |
| `daily_song_submitted` | `daily_date`, `skipped` |
| `daily_song_revealed` | result |
| `daily_share_clicked` | `daily_date` |

### Distribution / virality
| event | props |
|---|---|
| `share_clicked` | `channel` / platform |
| `challenge_created` | `slug`, `from` |
| `challenge_play_started` | `slug` |
| `challenge_play_completed` | result |
| `challenge_signup_claimed` | `slug`, `correct` |
| `challenge_board_viewed` | `slug` |
| `challenge_shared` | `slug`, `channel` |
| `referral_link_copied` | — |
| `referral_link_shared` | `channel` |
| `referral_confirmation_seen` | `count` |

### Sign-up / onboarding
| event | props |
|---|---|
| `handle_claimed` | `handle`, `referred` |

### Profiles / social
| event | props |
|---|---|
| `profile_viewed` | `handle` |
| `user_followed` / `user_unfollowed` | `handle` |
| `submissions_viewed` | — |
| `acceptance_seen` | `count`, `xp` |

### Leaderboards
| event | props |
|---|---|
| `leaderboard_viewed` | `board`, `window`, `artist_id` |
| `contributor_leaderboard_viewed` | — |

### UGC submission
| event | props |
|---|---|
| `bar_submitted` | `filled` |
| `submission_created` | `id`, `filled` |
| `submission_rate_limited` | `reason`, `cap`, `tier` |

## Renames applied (PUN-41)

`view_leaderboard`→`leaderboard_viewed`, `view_contributor_leaderboard`→
`contributor_leaderboard_viewed`, `view_profile`→`profile_viewed`,
`view_my_submissions`→`submissions_viewed`, `view_challenge_board`→
`challenge_board_viewed`, `create_challenge`→`challenge_created`,
`follow_user`→`user_followed`, `unfollow_user`→`user_unfollowed`,
`play_challenge_start`→`challenge_play_started`, `play_challenge_complete`→
`challenge_play_completed`, `challenge_signup_claim`→`challenge_signup_claimed`,
`share_challenge`→`challenge_shared`, `referral_landing_view`→
`referral_landing_viewed`, `referral_confirmed_seen`→`referral_confirmation_seen`,
`submit_bar`→`bar_submitted`, and all `*_error`→`*_failed`. Prop `artistId`→
`artist_id`. Done pre-launch (zero production history to preserve).
