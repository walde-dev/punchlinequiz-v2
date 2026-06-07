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
| `first_run_started` | — (fires once for a brand-new device) |
| `session_started` | first round of a tab session (acquisition context) |
| `play_opened` | — |
| `round_started` | round context |
| `answer_selected` | artist guess |
| `answer_revealed` | result |
| `answer_failed` | `punchline_id`, `message` |
| `early_win` | `punchline_id`, `mode` (first correct of a run) |
| `cloze_submitted` / `cloze_revealed` | guess / result |
| `cloze_failed` | `punchline_id`, `message` |
| `song_guess_submitted` / `song_guess_revealed` | guess / result |
| `song_guess_failed` | `punchline_id`, `message` |
| `next_clicked` | `punchline_id` |
| `next_failed` | `message` |
| `explainer_dismissed` | — |
| `session_restart_clicked` | — |
| `session_restart_failed` | `message` |
| `session_completed` | `score`, `total`, `mode`, `artist_slug` |
| `card_render_succeeded` / `card_render_failed` | `ms`, `mode` (share-card telemetry, PUN-122) |

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
| `share_clicked` | `channel`, `score`, `total`, `mode`, `artist_slug` |
| `share_completed` / `share_dismissed` | `channel` |
| `challenge_created` | `slug`, `from` (`session` \| `propagation`), `signed_in`, `score`, `total` |
| `challenge_gauntlet_started` | `slug`, `creator_score` (creator opens own board) |
| `challenge_link_opened` | `slug`, `creator_score` (recipient opens a shared link) |
| `challenge_play_started` | `slug` |
| `challenge_play_completed` | `slug`, `correct`, `solve_ms`, `is_creator` |
| `challenge_name_set` | `slug` (anon names themselves to land on the board) |
| `challenge_signup_claimed` | `slug`, `correct` (anon run claimed after signup) |
| `challenge_board_viewed` | `slug` |
| `challenge_shared` | `slug`, `channel` |
| `challenge_dethroned_viewed` / `challenge_dethroned_clicked` | dethrone re-engagement |
| `referral_landing_viewed` | `source`, `handle` _(dormant — see below)_ |
| `referral_link_copied` | — _(dormant)_ |
| `referral_link_shared` | `channel` _(dormant)_ |
| `referral_confirmation_seen` | `count` _(dormant)_ |

### Sign-up / onboarding
| event | props |
|---|---|
| `signup_prompt_shown` | `source` (`pill` \| `gate` \| `session_complete`), `xp`/`rank`/`hard` |
| `signup_prompt_clicked` | `source` |
| `signup_prompt_dismissed` | `source` |
| `auth_session_active` | — (signed-in session heartbeat, PR#18) |
| `handle_claimed` | `handle`, `referred` |
| `xp_claimed` | anon XP banked onto a new account |

> **Impression caveat:** `signup_prompt_shown` fires once per component mount (guarded
> by a ref), so the pill/gate re-emit it across page views — ~2 per session. Read it
> by **distinct session**, not raw count.

### Quiz (artist landing — PUN-103) — **dormant**
| event | props |
|---|---|
| `quiz_start_clicked` | `artist_slug` |
| `quiz_started` | round context |
| `quiz_artist_cleared` | `artist_slug` |

> The `/quiz/$slug` route ships but nothing links to it yet (0 pageviews), so these
> have never fired. Not broken — un-launched.

### Infra / diagnostics
| event | props |
|---|---|
| `discord_click` | placement |
| `chunk_reload` | recovery from a stale-chunk load error |

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
| `leaderboard_profile_click` | `handle` |
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
`artist_id`.

> **Correction (2026-06-07 audit):** the rename actually rolled out ~Jun 1–2 *with*
> live traffic, not pre-launch — both old and new names appear in `game_events` for a
> couple of days (old names stop ~Jun 2). So historical queries spanning that window
> must `UNION` the old + new names. No live double-emit remains.

## Dormant events (fire ~never, by design — not bugs)

Don't read these as broken logging:
- **Broadcast share / referral** (`share_*`, `referral_*`): there's ~no demand for
  open-ended sharing; the **Challenge** loop is the real distribution bet. (See the
  share-vs-challenge decision.)
- **`quiz_*`**: `/quiz` route is un-launched (nothing links to it).
- **`acceptance_seen`**: requires accepted UGC submissions, of which there are still
  very few.
- **`challenge_signup_claimed`**: correctly wired but low-volume — the challenge-loop
  conversion KPI to watch as that loop ramps.
