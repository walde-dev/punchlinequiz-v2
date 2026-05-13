# pquiz content API — design

**Date:** 2026-05-13
**Status:** Approved (sections 1–2); section 3–4 collapsed into this spec by user request to ship.

## Goal

Let Waldemar add, edit, and delete punchlines from any device — phone (Claude.ai), laptop (Claude Code), or a Telegram-driven agent ("Hermes") — without touching the database directly.

## Decisions

- **Foundation:** Plain HTTP JSON API on the existing TanStack Start web app, deployed with the app on Vercel.
- **Auth:** Single static bearer token (`PQUIZ_ADMIN_TOKEN`) in env. Constant-time compare.
- **Operations:** Smart upsert (auto-create artist/song), edit, soft + hard delete, list, get-by-id.
- **Dedup:** Reject duplicate lines within the same song (409 with existing id).
- **Ergonomics for Claude Code:** Slash commands in `.claude/commands/` that wrap `fetch` calls; Hermes uses HTTP directly.

## API surface

All routes under `/api/admin/*`. All require `Authorization: Bearer ${PQUIZ_ADMIN_TOKEN}`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/bars` | Smart upsert. Body `{ artist, song, line, album?, releaseYear?, perfectSolution?, acceptableSolutions? }`. Resolves or creates artist + song. Returns `201 { punchlineId, songId, artistId, created: { artist, song } }`. Dup line → `409 { error: "duplicate_line", details: { existingId } }`. |
| `GET` | `/api/admin/bars` | List with filters: `?artist=`, `?song=`, `?search=`, `?limit=` (default 50, max 200), `?offset=`. Joined artist/song fields in response. |
| `GET` | `/api/admin/bars/:id` | Single bar with full context. |
| `PATCH` | `/api/admin/bars/:id` | Edit `line`, `active`, `perfectSolution`, `acceptableSolutions`. |
| `DELETE` | `/api/admin/bars/:id` | Soft delete (sets `active=false`). `?hard=true` for hard delete. |
| `PATCH` | `/api/admin/artists/:id` | Edit `name`, `imageUrl`, `active`. |
| `PATCH` | `/api/admin/songs/:id` | Edit `title`, `album`, `albumArtUrl`, `releaseYear`. |
| `GET` | `/api/admin/ping` | Auth check; returns `{ ok: true }`. |

### Resolution rules (POST /bars)

- `artist`: case-insensitive match against `artists.name` or `artists.slug`. Miss → create with `slug = slugify(name)`.
- `song`: case-insensitive match against `songs.title` *within that artist*. Miss → create with optional `album`, `releaseYear`.
- `line`: normalized (trim, collapse whitespace, lowercase) → compared against same-song bars. Match → 409.

## Auth + error model

- **Middleware:** `requireAdmin(request)` reads `Authorization` header, splits `Bearer <token>`, `timingSafeEqual` vs `process.env.PQUIZ_ADMIN_TOKEN`. Miss/mismatch → `401 { error: "unauthorized" }`. Missing env var on server → log + `500`.
- **Error shape:** `{ error: <snake_case_code>, message: <human-readable>, details?: object }`.
- **Status codes:** `200` / `201` / `400` (validation) / `401` / `404` / `409` (dup) / `500`.
- **Validation:** Per-route handlers trim + length-cap inputs (line ≤ 1000, name ≤ 200, year 1980–2100). Reject empty strings/arrays explicitly.
- **Audit:** Every successful admin write inserts a `game_events` row with `name = "admin_<verb>"` and props `{ path, status, target_id, summary }`. Reuses the existing analytics table — no new infra; queryable for an audit trail.

## Slash commands (Claude Code)

Project-scoped, in `.claude/commands/`. Each is a markdown file that prompts Claude to call the API with a clear shape.

- `/pquiz-add` — prompts for artist/song/line, posts to `/api/admin/bars`, reports id or 409.
- `/pquiz-list` — fetches with filters, prints a compact table.
- `/pquiz-edit` — accepts id + field changes, sends PATCH.
- `/pquiz-delete` — soft-deletes; `--hard` for hard.

All commands read `PQUIZ_ADMIN_TOKEN` and `PQUIZ_BASE_URL` from the env. Default base = `http://localhost:3002` in dev; production base set per machine.

## Out of scope (deferred)

- MCP server wrapper — defer until Claude-client-only ergonomics actually beat the slash commands.
- Bulk import endpoint — current `db:seed` script + the upsert endpoint can cover bulk needs.
- Image upload — for now `imageUrl` and `albumArtUrl` are passed as strings by the caller.
- Per-client tokens / audit-by-user — single bearer is enough until a second human admin exists.
- Rate limiting — single admin, low traffic; Vercel default protections suffice.

## Files touched (implementation preview)

- `apps/web/.env`, Vercel env: `PQUIZ_ADMIN_TOKEN`
- `apps/web/src/lib/admin.ts` — `requireAdmin`, error helpers, audit insert
- `apps/web/src/lib/upsert.ts` — pure upsert resolution against the DB
- `apps/web/src/routes/api/admin/bars.ts`
- `apps/web/src/routes/api/admin/bars.$id.ts`
- `apps/web/src/routes/api/admin/artists.$id.ts`
- `apps/web/src/routes/api/admin/songs.$id.ts`
- `apps/web/src/routes/api/admin/ping.ts`
- `.claude/commands/pquiz-add.md`, `.claude/commands/pquiz-list.md`, `.claude/commands/pquiz-edit.md`, `.claude/commands/pquiz-delete.md`
