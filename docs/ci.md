# CI

Lightweight GitHub Actions pipeline in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
Runs on every pull request and on pushes to `main`.

It exists because every line here is written by agents working in parallel —
the merge-time gate is what makes that safe. The checks are the cheap,
deterministic ones agents fail at silently (type errors, lint, broken build),
plus one real end-to-end smoke.

## Jobs

### `quality` — typecheck · lint · test · build
Secret-free and fast. Each is a turbo task, so it's cached and runs over the
whole monorepo:

| Check | Command | What it catches |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | type errors across `web`, `ui`, `db` |
| Lint | `pnpm lint` | the no-hand-rolled-UI guardrail, import hygiene, hook rules |
| Unit tests | `pnpm test` | the game's correctness core (answer matching, scoring) |
| Build | `pnpm build` | the production Nitro/Vite build compiles |

The build needs no secrets: `lib/db.ts` is inert on import (the DB handle is a
lazy proxy), so nothing connects at build time.

Run the whole gate locally before pushing:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

### `e2e` — play smoke (against the Vercel preview)
A separate workflow ([`.github/workflows/e2e-preview.yml`](../.github/workflows/e2e-preview.yml))
runs one Chromium test ([`apps/web/e2e/play.smoke.spec.ts`](../apps/web/e2e/play.smoke.spec.ts))
that loads `/play` on the **deployed** app and confirms it serves an interactive
round. This exercises SSR + the `getRound` server-fn + the real database — if a
deploy is fundamentally broken, it fails.

**Why against the deploy, not a local server:** the app's DB layer uses the
Neon-serverless driver, which only speaks to a remote Neon/Vercel Postgres over
HTTP/WS — it can't connect to a plain Postgres service container. So instead of
faking a DB, the smoke targets the real Vercel deployment (which has its own
Neon DB + Clerk env). It also means the check literally gates "did this commit
deploy to something that works."

**How it triggers:** Vercel reports each deploy via the GitHub
`deployment_status` event; the workflow runs on `state == 'success'` and points
Playwright at the deploy's `target_url`. No DB or Clerk secrets are needed in
CI — the deployed app brings its own. (This requires Vercel's Git integration,
which is already on — preview deploys show up as the `Vercel` check on PRs.)

Run it locally — needs no extra setup, your `.env` already has a Neon
`DATABASE_URL` + Clerk keys, and Playwright boots `pnpm dev` for you:

```bash
pnpm e2e
```

Or point it at any deployed URL:

```bash
PLAYWRIGHT_BASE_URL=https://your-preview.vercel.app pnpm e2e
```

## Turbo remote cache (optional, recommended)

Many parallel agents → many CI runs. A shared remote cache skips re-running
unchanged work. To enable, link Turbo to Vercel Remote Cache and add — in repo
**Settings → Secrets and variables → Actions**, or via `gh`:

```bash
# a Vercel access token: `npx turbo login` then copy it, or
# create one at vercel.com/account/tokens
gh secret   set TURBO_TOKEN     # paste the Vercel token   (Secrets tab)
gh variable set TURBO_TEAM      # your Vercel team slug     (Variables tab)
```

Note `TURBO_TOKEN` is a **secret** and `TURBO_TEAM` is a **variable** (it's not
sensitive). Without them, CI uses a cold local cache each run (still fast on
this repo).

## Making CI a required gate

Landings currently go straight to `main` (Vercel deploys from `main`), so on
`main` this pipeline is a post-push signal. To make green CI **block** a merge,
switch to a PR flow and turn on branch protection:

```bash
gh api -X PUT repos/walde-dev/punchlinequiz-v2/branches/main/protection \
  -F required_status_checks.strict=true \
  -F 'required_status_checks.contexts[]=typecheck · lint · test · build' \
  -F enforce_admins=false \
  -F required_pull_request_reviews= \
  -F restrictions=
```

The workflow already runs on `pull_request`, so no workflow change is needed —
just the protection rule.

## Lint policy notes

Adopting lint as a gate required two deliberate calls (see
[`apps/web/eslint.config.js`](../apps/web/eslint.config.js)):

- `@typescript-eslint/no-unnecessary-condition` is **off**. It's a type-aware
  *style* rule that flags defensive guards on values TS types as non-null but
  which are runtime-nullable (DB rows, API payloads). Auto-fixing it would strip
  real null checks. Re-enable and burn down the backlog if you want it.
- `react-hooks` is registered explicitly (`@tanstack/eslint-config` dropped it):
  `rules-of-hooks` is a hard **error**, `exhaustive-deps` is a **warning**.

Warnings don't fail CI. The no-hand-rolled-UI guardrail and everything else stay
hard errors.
