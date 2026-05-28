# Auth Clerk — Implementation Plan

Self-contained. Reflects locked design decisions from the grill-me session.

## Package name correction

Actual package is **`@clerk/tanstack-react-start`** (v1.2.3+), not `@clerk/tanstack-start`. `@clerk/clerk-react` is deprecated — `@clerk/tanstack-react-start` re-exports the client components from `@clerk/react`. Final install:

```bash
pnpm add @clerk/tanstack-react-start @clerk/backend --filter web
```

## API surface used

- Client components from `@clerk/tanstack-react-start`: `ClerkProvider`, `SignIn`, `UserButton`, `Show` (replaces the legacy `<SignedIn>`/`<SignedOut>` — use `<Show when="signed-in">`).
- Server entry: `auth()` and `clerkMiddleware()` from `@clerk/tanstack-react-start/server`. `auth()` is request-scoped via async context (no `request` argument). `clerkMiddleware()` is registered as a global request middleware.
- Middleware registration uses TanStack Start's `createStart()` from `@tanstack/react-start`, exported as `startInstance` from `apps/web/src/start.ts`. The Vite plugin auto-detects this file — no `vite.config.ts` change needed.

## Scope

Phase 1 only. Admin auth migrates to Clerk; CLI keeps `PQUIZ_ADMIN_TOKEN`. No public-facing sign-up UI. No user table. No event-tracking changes. No Apple sign-in.

## Locked decisions

1. Server auth via `@clerk/tanstack-start`'s `getAuth(request)` + JWT-template claims. No hand-rolled cookie parsing.
2. Phase 1 = admin migration + plumbing only.
3. Admin auth is dual-path: Clerk session OR `Authorization: Bearer $PQUIZ_ADMIN_TOKEN`.
4. Clerk methods: email magic code + Google. No Apple.
5. Only `/admin/login` is modified. No `/sign-in`, `/sign-up`, `/sso-callback`.
6. Role stored in `publicMetadata.role`. (Originally private, but Clerk intentionally excludes `private_metadata` from session tokens — it never made it into the JWT regardless of the template. Public metadata works; the "leak" is that a signed-in admin can see their own role, which tells them nothing new.)
7. Audit records typed actor: `{kind: "clerk", userId, email}` or `{kind: "token"}`.
8. `pquiz_admin` cookie path is dropped. Bearer header only for token path.
9. Full `@clerk/tanstack-start` SDK wiring (Vite plugin + server handler).
10. JWT template carries `role`, `email`, `name`. Networkless admin checks.
11. Global header shows `<SignedIn><UserButton /></SignedIn>`. Invisible to anonymous traffic.
12. Email auth = magic code only.

## Clerk dashboard setup (Walde, parallel to code)

1. Create project, **select EU data residency** at creation.
2. User & Authentication → Email, Phone, Username → Email: enable **verification code**, disable password.
3. Social Connections → Google → enable. Clerk shows a redirect URL — copy it. Then in [console.cloud.google.com](https://console.cloud.google.com):
   - APIs & Services → Credentials → **Create OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: paste the Clerk redirect URL
   - Copy Client ID + Client Secret → paste into Clerk's Google connection settings
   - Strategy in Clerk is `oauth_google`
4. **Sessions → Customize session token** (this edits the default session token, which is what `auth()` reads — not a named JWT Template). Add custom claims:
   ```json
   {
     "metadata": "{{user.public_metadata}}",
     "email": "{{user.primary_email_address}}",
     "name": "{{user.full_name}}"
   }
   ```
   Server-side, `sessionClaims.metadata.role`, `.email`, `.name` are populated networklessly. Clerk shortcodes only resolve top-level metadata objects, not dotted paths, so the role lives inside the `metadata` object.
5. After first sign-in: Users → select Walde → Metadata → Private metadata → `{ "role": "admin" }`.
6. Set env vars locally and in Vercel:
   - `VITE_CLERK_PUBLISHABLE_KEY` (client)
   - `CLERK_PUBLISHABLE_KEY` (server)
   - `CLERK_SECRET_KEY` (server)
   Use `pk_test_…` / `sk_test_…` locally, `pk_live_…` / `sk_live_…` in Vercel production.

## Implementation steps

### 1. Packages

```bash
pnpm add @clerk/tanstack-start @clerk/clerk-react @clerk/backend --filter web
```

`.env.example` gets the three Clerk vars.

### 2. Vite plugin

`apps/web/vite.config.ts`: import and add Clerk's plugin per `@clerk/tanstack-start` docs (likely `clerkPlugin()` or similar — verify against installed version's README). Place it before `tanstackStart()` so it wraps the server entry.

### 3. ClerkProvider in root

`apps/web/src/routes/__root.tsx`:
- Import `ClerkProvider` from `@clerk/tanstack-start` (not `@clerk/clerk-react` — the TS-Start re-export wires SSR state).
- Read publishable key from `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`. Throw at module top if missing.
- Wrap children inside `<body>`, outside `<I18nextProvider>` (Clerk needs to be highest).
- `afterSignOutUrl="/"`.
- Pass `clerkDarkAppearance` as the default `appearance` prop.

### 4. Dark appearance theme

`apps/web/src/lib/clerk-theme.ts` (NEW):

```ts
import type { Appearance } from "@clerk/clerk-react"

export const clerkDarkAppearance: Appearance = {
  baseTheme: undefined,
  variables: {
    colorBackground: "#1f1f1f",
    colorInputBackground: "#2a2a2a",
    colorInputText: "#e5e5e5",
    colorPrimary: "#fbbf24",
    colorText: "#e5e5e5",
    colorTextOnPrimaryBackground: "#121212",
    colorTextSecondary: "#a3a3a3",
    colorNeutral: "#404040",
    borderRadius: "0.75rem",
    fontFamily: "Figtree, system-ui, sans-serif",
  },
  elements: {
    card: "bg-[#1f1f1f] border border-white/10 rounded-2xl shadow-2xl",
    headerTitle: "text-white font-extrabold",
    headerSubtitle: "text-neutral-400",
    socialButtonsBlockButton: "border-white/10 hover:bg-white/5",
    socialButtonsBlockButtonText: "text-neutral-200",
    formButtonPrimary: "bg-[#fbbf24] text-[#121212] hover:bg-[#f59e0b] font-bold",
    footerActionLink: "text-[#fbbf24] hover:text-[#f59e0b]",
    dividerLine: "bg-white/10",
    dividerText: "text-neutral-500",
    formFieldInput: "bg-[#2a2a2a] border-white/10 text-neutral-200",
    formFieldLabel: "text-neutral-400 text-sm",
    identityPreviewText: "text-neutral-300",
    identityPreviewEditButton: "text-[#fbbf24]",
  },
}
```

### 5. Server auth helper

`apps/web/src/lib/auth.ts` (NEW):

```ts
import { getAuth } from "@clerk/tanstack-start/server"

export type Actor =
  | { kind: "clerk"; userId: string; email: string | null; name: string | null }
  | { kind: "token" }

export type AuthResult = { actor: Actor; role: "admin" | "user" | "token" }

export async function getActor(request: Request): Promise<AuthResult | null> {
  // 1) Clerk path — networkless via JWT claims
  const { userId, sessionClaims } = await getAuth(request)
  if (userId && sessionClaims) {
    const claims = sessionClaims as { role?: string; email?: string; name?: string }
    return {
      actor: {
        kind: "clerk",
        userId,
        email: claims.email ?? null,
        name: claims.name ?? null,
      },
      role: claims.role === "admin" ? "admin" : "user",
    }
  }
  // 2) Bearer token path — CLI scripts
  if (isValidBearerToken(request)) {
    return { actor: { kind: "token" }, role: "token" }
  }
  return null
}

export async function requireAdmin(request: Request): Promise<AuthResult> {
  const result = await getActor(request)
  if (!result) throw unauthorized()
  if (result.role !== "admin" && result.role !== "token") throw forbidden()
  return result
}
```

`isValidBearerToken(request)` is moved from `lib/admin.ts` (constant-time match, header-only — cookie path deleted). `unauthorized()` / `forbidden()` build `Response` errors mirroring the existing error shape in `lib/admin.ts`.

### 6. Refactor `lib/admin.ts`

- Delete `ADMIN_COOKIE`, the cookie branch of `extractToken()`, and `isAdminRequest`'s cookie support.
- Rename `requireAdmin` → keep but mark it internal / unused; OR delete and have `lib/auth.ts` own the canonical `requireAdmin`. **Delete it.** Admin routes will import from `lib/auth.ts`.
- Update `audit()` to accept an `Actor`:
  ```ts
  export function audit(name: string, actor: Actor, props: Record<string, unknown>): void {
    const sessionId = actor.kind === "clerk" ? actor.userId : "admin_token"
    db.insert(gameEvents).values({
      sessionId,
      name: `admin_${name}`,
      props: { ...props, actor_kind: actor.kind, ...(actor.kind === "clerk" ? { actor_email: actor.email } : {}) },
    }).catch((e) => console.error("[admin] audit insert failed", e))
  }
  ```

### 7. Update admin API routes

Every file under `apps/web/src/routes/api/admin/*.ts`:

- Replace `import { requireAdmin } from "../../../lib/admin"` with `import { requireAdmin } from "../../../lib/auth"`.
- Replace `const fail = requireAdmin(request); if (fail) return fail` with `const { actor } = await requireAdmin(request)`.
- Pass `actor` into every `audit()` call.

Files affected: `bars.ts`, `bars.$id.ts`, `artists.ts`, `artists.$id.ts`, `artists.$id.tags.ts`, `songs.$id.ts`, `tags.ts`, `daily.ts`, `daily.$id.ts`, `search.artists.ts`, `search.track.$id.ts`, `search.tracks.ts`, `session.ts`, `ping.ts`. (`session.ts` is the cookie-set endpoint — see step 9.)

### 8. Update `lib/session.ts`

```ts
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { getActor } from "./auth"

export const isAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest()
  const result = await getActor(req)
  return { admin: result?.role === "admin" }
})
```

The `getAuthFn` from the spec is not needed in Phase 1 (no user-facing auth UI consuming it).

### 9. Kill `/api/admin/session.ts`

This endpoint exists to set the `pquiz_admin` cookie from the token-form login. With the cookie path dropped, the endpoint is dead. **Delete the file.**

### 10. `/admin/login` becomes Clerk widget

`apps/web/src/routes/admin/login.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router"
import { SignIn } from "@clerk/clerk-react"
import { isAdminFn } from "../../lib/session"

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
  loader: async () => {
    const { admin } = await isAdminFn()
    if (admin) throw redirect({ to: "/admin" })
    return null
  },
})

function AdminLoginPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center px-5 py-12">
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative w-full max-w-sm">
        <SignIn routing="hash" forceRedirectUrl="/admin" signUpUrl="/admin/login" />
      </div>
    </main>
  )
}
```

Notes:
- `routing="hash"` keeps the widget self-contained (no `/sso-callback` route needed).
- `signUpUrl` points back at itself so Clerk's "create account" link doesn't navigate to a non-existent `/sign-up`. Anyone who clicks it can still create a Clerk account — that's fine; they just won't have `role: "admin"`.
- The previous token-form JSX and `pquiz_admin` cookie-set call are removed.

### 11. `/admin` guard

`apps/web/src/routes/admin/index.tsx`'s `beforeLoad` already calls `isAdminFn()`. It keeps working — only the underlying implementation changed.

### 12. Global header with `<UserButton>`

In `__root.tsx` (or a small `<Header />` component imported there), inside the `<ClerkProvider>` and above `{children}`:

```tsx
<header className="sticky top-0 z-40 flex items-center justify-end px-4 py-3">
  <SignedIn>
    <UserButton afterSignOutUrl="/" appearance={clerkDarkAppearance} />
  </SignedIn>
</header>
```

No `<SignedOut>` branch in Phase 1 — anonymous players see nothing. Don't add a logo / nav links; the rest of the player UI owns those.

### 13. Clean up

- Delete unused imports in `lib/admin.ts` after the role check moves out.
- Delete the spec's proposed `lib/clerk.ts` if `@clerk/tanstack-start` exposes a usable client without needing a custom singleton (likely it does — verify when implementing). Otherwise keep it but only for the rare `users.getUser()` call.
- `PQUIZ_ADMIN_TOKEN` stays in `.env.example` as before.

## Verification checklist

Before claiming done:

- [ ] `pnpm typecheck` passes in `apps/web`.
- [ ] Local dev: sign in to `/admin/login` via email magic code → land on `/admin` → review queue loads.
- [ ] Local dev: sign in via Google → land on `/admin`.
- [ ] CLI tools work end-to-end: `pquiz-list`, `pquiz-ping` succeed against local dev with `PQUIZ_ADMIN_TOKEN` only (no Clerk session).
- [ ] Hit `/api/admin/bars` with no auth → 401.
- [ ] Sign in as a non-admin Clerk user → hit `/admin` → bounced to `/admin/login` (acceptable Phase 1 UX; the bounce-loop edge case isn't reachable for end users since there's no public sign-up).
- [ ] `audit()` rows in `game_events` show correct `actor_kind` / `actor_email` for Clerk admin actions; `actor_kind: "token"` for a CLI bar-add.
- [ ] Sign out via `<UserButton>` → redirected to `/`.
- [ ] Anonymous player at `/` sees no auth UI at all.

## Rollout

1. Walde provisions Clerk project, JWT template, env vars (in progress).
2. PR with this implementation.
3. Walde sets `publicMetadata = { "role": "admin" }` on his Clerk user after first sign-in.
4. Verify checklist on preview deploy.
5. Merge.
6. Set live keys in Vercel prod, set `role: "admin"` on prod user.

## Out of scope (deferred to Phase 3)

- Public sign-up UI, `/sign-in`, `/sign-up`, `/sso-callback`
- Local `users` table
- Linking anonymous localStorage progress to a Clerk account post-sign-up
- Apple sign-in
- Per-user stats / leaderboard
- Clerk webhooks (`user.created`, `user.updated`)
- Event tracking with `userId`
