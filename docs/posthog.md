# PostHog — product analytics runbook

Covers the Product Analytics project (Linear PUN-40…45). PostHog is the product-
analytics backbone (funnels, retention, replay, flags/experiments). Axiom stays
for logs; the `gameEvents` DB table stays as raw backup + admin audit.

> **Account:** a **dedicated punchlinequiz PostHog project** — NOT the Finto org,
> and the PostHog MCP is not used here. Keys are provided out of band.

## 1. Setup / env (PUN-40)

Set in `.env` (see `.env.example` for the full annotated block):

| var | where | purpose |
|---|---|---|
| `VITE_PUBLIC_POSTHOG_KEY` | client | Project API key (`phc_…`). Unset → client init no-ops. |
| `VITE_PUBLIC_POSTHOG_HOST` | client | UI host for dashboard links (EU default). |
| `POSTHOG_KEY` | server | Project API key for server HTTP capture + SSR flag eval. |
| `POSTHOG_HOST` | server | Direct ingest/api host (EU default). |
| `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` | scripts only | Dashboards-as-code. |

Everything is env-gated: with no keys, `logEvent` still writes to the DB + Axiom,
and PostHog is a silent no-op. Disabled automatically in dev (`opt_out_capturing`).

### Reverse proxy (adblocker-resistant)
Events go through our own domain via `apps/web/vercel.json` rewrites:
`/ingest/static/*` → `eu-assets.i.posthog.com`, `/ingest/*` → `eu.i.posthog.com`.
`posthog-js` is configured with `api_host: "/ingest"`. **US project?** flip both
rewrite destinations to `us-assets`/`us.i` and set the `*_HOST` vars to `us.*`.

## 2. Instrumentation & taxonomy (PUN-41)
- Single choke point: `logEvent(name, props)` in `lib/track.ts` → PostHog
  (`capturePostHog`) **and** `recordEvent` (DB + Axiom). `recordEvent` does NOT
  re-send to PostHog (would double-count).
- Server-only events: `capturePostHogServer(distinctId, event, props)` in
  `lib/posthog.server.ts` (fetch-based, no SDK — avoids the Nitro bundling trap).
  System/cron/Discord events stay Axiom-only by decision.
- Autocapture: DOM autocapture **off**, `$pageview`/`$pageleave` **on** (free-tier).
- Canonical event list: **`docs/event-taxonomy.md`**.

## 3. Identity (PUN-42)
- distinct_id is bootstrapped from the existing `pq.session_id` UUID, so PostHog,
  Axiom, Sentry and the DB all share one anonymous id.
- `components/analytics-identity.tsx` calls `identify(clerkUserId, {email,name,handle})`
  on sign-in (merges the anon id → the account; covers the post-play sign-up wall)
  and `reset()` on sign-out (shared-device correctness).
- **PII:** we deliberately attach email + real name to person profiles, capture
  on load with **no consent banner**, and enable GeoIP. This overrides the
  CLAUDE.md no-PII rule by explicit project decision (GDPR/EU risk accepted).
  Replay inputs remain masked (below).

## 4. Dashboards (PUN-43)
Analytics-as-code in `scripts/posthog/dashboards.ts`; apply with `pnpm analytics:apply`.
- **North-star:** Weekly Active Players completing ≥1 round.
- **Guardrails:** D1/7/30 retention, viral k-factor, sign-up conversion.
- Funnels: acquisition (land→first answer→2nd round→sign-up), virality
  (share→landing→sign-up). Edit the file + re-run to update live insights.

## 5. Flags & experiments (PUN-44)
- **No flicker:** flags are server-evaluated in the root route loader
  (`lib/flags.ts` → `evaluateFlags`), injected into the first HTML render
  (`window.__PH_BOOTSTRAP__`), and read by `posthog-js` `bootstrap.featureFlags`.
- Harness: `lib/experiments.ts` — `useExperiment(flagKey)` returns the assigned
  variant; reading it auto-fires the PostHog exposure event. Compare your existing
  outcome events (e.g. `share_clicked`, `handle_claimed`) across variants.
- **No live experiment is configured yet** — this is the ready harness. Candidate
  firsts: share-card variants, sign-up prompt timing, first-bar difficulty.

### Launching an experiment safely (guardrails)
1. Create the experiment in PostHog (multivariate flag + primary metric).
2. Gate UI with `useExperiment("your-flag")`; ship behind a small rollout %.
3. Watch a **guardrail metric** (e.g. session_completed rate) for regressions.
4. Conclude only on adequate sample + duration — never peek-and-ship.

## 6. Session replay (PUN-45)
- Enabled in `posthog.ts` with `maskAllInputs: true` + `maskTextSelector: "*"`
  → no typed text/PII is ever recorded.
- **Capture strategy:** 100% early (low launch traffic = best debugging value).
  Set a **minimum duration** filter in PostHog project settings to skip bounces.
- **Free tier ≈ 5,000 recordings/mo.** When approaching the cap, lower the
  sampling rate (project settings) or switch to trigger-based recording. This is
  a project-side setting, not in the SDK — monitor it post-launch.
