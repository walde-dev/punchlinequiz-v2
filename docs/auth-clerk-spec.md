# Auth Spec — Clerk Integration

## Context

Punchlinequiz currently has **zero user authentication**. Players are anonymous (localStorage session IDs). Admin auth is a shared bearer token (`PQUIZ_ADMIN_TOKEN`) validated with `timingSafeEqual`.

This spec adds Clerk as the identity provider. Goals:

1. Users can create accounts (email + Google + Apple) to persist scores, track stats, and appear on leaderboards.
2. Admin access moves from shared token to Clerk user metadata (role = "admin").
3. The game stays fully playable for anonymous users — auth is optional, required only for stats/leaderboard/admin.

## Tech Stack Reality Check

| Layer | Technology |
|-------|-----------|
| Framework | **TanStack Start** (React 19 + TanStack Router + Nitro) |
| Build | Vite 7 |
| Server runtime | Nitro (Vinxi under the hood) |
| Package manager | pnpm workspaces + Turborepo |

**This is NOT Next.js.** We use `@clerk/tanstack-start` (v0.11.5), not `@clerk/nextjs`.

## Packages

```bash
pnpm add @clerk/tanstack-start @clerk/clerk-react @clerk/backend --filter web
```

| Package | Version | Purpose |
|---------|---------|---------|
| `@clerk/tanstack-start` | ^0.11.5 | TanStack Start integration — middleware, server helpers, SSR session handling |
| `@clerk/clerk-react` | ^5.61.3 | Client-side React components + hooks (`ClerkProvider`, `SignedIn`, `useUser`, etc.) |
| `@clerk/backend` | ^3.4.7 | Server-side session verification, user management API |

## Environment Variables

### Client-side (Vite-exposed)

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Vite exposes any env var prefixed with `VITE_` to the client bundle. This is the Clerk publishable key — safe to expose (it's not a secret).

### Server-side only

```env
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
```

`CLERK_SECRET_KEY` is used by `@clerk/backend` to verify session tokens and call the Clerk Management API (e.g., listing users, checking roles). **Never expose this to the client.**

### Updated .env.example

```env
# ─────────────────────────────────────────────────────────────
# Clerk Authentication
# ─────────────────────────────────────────────────────────────

# Client-side publishable key (exposed to browser via VITE_ prefix).
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here

# Server-side keys — used for session verification and Management API.
CLERK_SECRET_KEY=sk_test_your_secret_here
CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

**Walde will create the Clerk project and set these env vars in Vercel + local `.env`.**

## Clerk Dashboard Configuration

### 1. Create Application

- Go to [dashboard.clerk.com](https://dashboard.clerk.com)
- Create new application → name: "punchlinequiz"
- Select sign-in methods: **Email**, **Google**, **Apple**

### 2. Email Authentication

- Enabled by default
- Email + password OR email verification code (magic code) — recommend **verification code** for simplicity (no password management, lower friction)
- Configure in: User & Authentication → Email, Phone, Username → Email address

### 3. Google OAuth

- User & Authentication → Social Connections → Google → Enable
- Clerk provides a redirect URL to add in Google Cloud Console
- Create OAuth credentials at [console.cloud.google.com](https://console.cloud.google.com):
  - APIs & Services → Credentials → Create OAuth Client ID
  - Application type: Web application
  - Authorized redirect URIs: copy from Clerk dashboard
  - Copy Client ID + Client Secret → paste into Clerk dashboard
- Strategy: `oauth_google`

### 4. Apple Sign In

- User & Authentication → Social Connections → Apple → Enable
- Requires Apple Developer account ($99/year)
- Create a Services ID at [developer.apple.com](https://developer.apple.com):
  - Certificates, Identifiers & Profiles → Identifiers → Register new (Services ID)
  - Enable "Sign In with Apple"
  - Configure: domains + redirect URLs from Clerk dashboard
  - Create a Key under "Keys" with "Sign In with Apple" enabled
  - Upload the .p8 private key into Clerk dashboard
- Strategy: `oauth_apple`
- **Apple requires domain verification** — add the DNS TXT + CNAME records Clerk provides

## Implementation

### Step 1: ClerkProvider in Root Layout

Wrap the entire app with `ClerkProvider` at the highest level — inside `RootDocument` in `__root.tsx`.

**File: `apps/web/src/routes/__root.tsx`**

```tsx
import { ClerkProvider } from "@clerk/clerk-react"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { Suspense, useEffect } from "react"
import { I18nextProvider, useTranslation } from "react-i18next"

import i18n from "../i18n"
import appCss from "@workspace/ui/globals.css?url"

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY")
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "punchlinequiz — Kennst du die Punchline?" },
      { name: "description", content: "Teste dein Rap-Wissen mit den härtesten Bars der deutschen Hip-Hop-Geschichte." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>Seite nicht gefunden.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function LangSync() {
  const { i18n } = useTranslation()
  useEffect(() => {
    document.documentElement.lang = i18n.language.startsWith("de") ? "de" : "en"
  }, [i18n.language])
  return null
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
          <I18nextProvider i18n={i18n}>
            <LangSync />
            <Suspense fallback={<div className="min-h-svh bg-background" />}>
              {children}
            </Suspense>
          </I18nextProvider>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  )
}
```

**Key changes:**
- Import `ClerkProvider` from `@clerk/clerk-react`
- Read `VITE_CLERK_PUBLISHABLE_KEY` from Vite env
- Fail-fast if key is missing (dev + build)
- Wrap inside `<body>`, outside all other providers
- `afterSignOutUrl="/"` redirects to home after sign-out

### Step 2: Server-Side Clerk Client

Create a shared server-side Clerk client for verifying sessions in API routes and server functions.

**File: `apps/web/src/lib/clerk.ts` (NEW)**

```ts
import { createClerkClient } from "@clerk/backend"

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error("Missing CLERK_SECRET_KEY environment variable")
}

export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
})
```

### Step 3: Server-Side Auth Helpers

**File: `apps/web/src/lib/auth.ts` (NEW)**

```ts
import type { Request } from "@clerk/backend"
import { clerkClient } from "./clerk"

export type AuthUser = {
  id: string
  email: string | null
  name: string | null
  imageUrl: string
  role: "user" | "admin"
}

/**
 * Extract and verify the Clerk session from a request.
 * Checks the __session cookie (Clerk's session token cookie).
 * Returns null if not authenticated.
 */
export async function verifyAuth(request: globalThis.Request): Promise<AuthUser | null> {
  try {
    // Extract the session token from the __session cookie
    const cookieHeader = request.headers.get("cookie") ?? ""
    const sessionToken = extractSessionToken(cookieHeader)

    if (!sessionToken) return null

    // Verify the token with Clerk's backend
    const verified = await clerkClient.verifyToken(sessionToken)
    if (!verified || !verified.sub) return null

    // Fetch the full user object
    const user = await clerkClient.users.getUser(verified.sub)
    if (!user) return null

    // Determine role from Clerk public metadata
    const role = (user.publicMetadata?.role as "user" | "admin") ?? "user"

    const primaryEmail = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    )

    return {
      id: user.id,
      email: primaryEmail?.emailAddress ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      imageUrl: user.imageUrl,
      role,
    }
  } catch {
    return null
  }
}

/**
 * Require authentication. Returns AuthUser or throws a 401 Response.
 */
export async function requireAuth(request: globalThis.Request): Promise<AuthUser> {
  const user = await verifyAuth(request)
  if (!user) {
    throw new Response(
      JSON.stringify({ error: "unauthorized", message: "Anmeldung erforderlich." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )
  }
  return user
}

/**
 * Require admin role. Returns AuthUser or throws a 403 Response.
 */
export async function requireAdmin(request: globalThis.Request): Promise<AuthUser> {
  const user = await requireAuth(request)
  if (user.role !== "admin") {
    throw new Response(
      JSON.stringify({ error: "forbidden", message: "Admin-Berechtigung erforderlich." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )
  }
  return user
}

/**
 * Extract __session cookie value.
 * Clerk stores the JWT in a cookie named "__session".
 */
function extractSessionToken(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.split("=")
    if (name?.trim() === "__session") {
      return decodeURIComponent(rest.join("=").trim()) || null
    }
  }
  return null
}
```

**Why `__session`?** Clerk uses this cookie name by default for the session JWT. The `@clerk/backend` SDK's `verifyToken` handles JWT validation (signature, expiry, issuer, audience).

### Step 4: Protect Admin Routes

Migrate admin routes from `PQUIZ_ADMIN_TOKEN` to Clerk-based admin auth.

**Admin role assignment:** In the Clerk dashboard, set `publicMetadata.role = "admin"` on Walde's user. This can be done via:
- Dashboard → Users → select user → Edit public metadata → `{ "role": "admin" }`
- Or programmatically: `clerkClient.users.updateUser(userId, { publicMetadata: { role: "admin" } })`

**Update `apps/web/src/lib/session.ts`:**

```ts
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { verifyAuth } from "./auth"
import type { AuthUser } from "./auth"

/** Client-callable server function: get current auth state. */
export const getAuthFn = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest()
  const user = await verifyAuth(req)
  return { user }
})

/**
 * Keep isAdminFn for backward compat during migration.
 * Returns { admin: boolean } based on Clerk role.
 */
export const isAdminFn = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest()
  const user = await verifyAuth(req)
  return { admin: user?.role === "admin" }
})
```

**Update admin API routes** (`apps/web/src/routes/api/admin/*.ts`):

Replace:
```ts
import { requireAdmin } from "../../../lib/admin"
// ...
const fail = requireAdmin(request)
if (fail) return fail
```

With:
```ts
import { requireAdmin as requireClerkAdmin } from "../../../lib/auth"
// ...
const user = await requireClerkAdmin(request)
// user is now available with id, email, name, role
```

**Update admin login page** (`apps/web/src/routes/admin/login.tsx`):

Replace the token-based login form with a Clerk `SignIn` component redirect. Admins sign in via Clerk normally, and the `beforeLoad` guard checks their role.

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router"
import { SignIn } from "@clerk/clerk-react"
import { isAdminFn } from "../../lib/session"

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
  loader: async () => {
    const { admin } = await isAdminFn()
    if (admin) throw redirect({ to: "/admin" })
    return { admin }
  },
})

function AdminLoginPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center px-5 py-12">
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative w-full max-w-sm">
        <SignIn
          routing="hash"
          signUpUrl="/admin/login"  // same page, Clerk handles the toggle
          afterSignInUrl="/admin"
        />
      </div>
    </main>
  )
}
```

**Update admin index guard** (`apps/web/src/routes/admin/index.tsx`):

```tsx
export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
  component: AdminDashboard,
  // ... rest of loader
})
```

### Step 5: User Sign-In / Sign-Up Page

Create a `/sign-in` route for regular users.

**File: `apps/web/src/routes/sign-in.tsx` (NEW)**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router"
import { SignIn, useUser } from "@clerk/clerk-react"

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
})

function SignInPage() {
  const { isSignedIn } = useUser()

  if (isSignedIn) {
    // Redirect signed-in users away
    window.location.href = "/"
    return null
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center px-5 py-12">
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Anmelden</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Speichere deine Scores und kletter die Rangliste hoch.
          </p>
        </div>
        <SignIn
          routing="hash"
          signUpUrl="/sign-up"
          afterSignInUrl="/"
          appearance={{
            elements: {
              // Style to match dark theme — override Clerk's default light theme
              rootBox: "w-full",
              card: "bg-card border border-border/60 rounded-3xl shadow-none",
            },
          }}
        />
      </div>
    </main>
  )
}
```

**File: `apps/web/src/routes/sign-up.tsx` (NEW)**

Same pattern, using `<SignUp>` component:

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { SignUp, useUser } from "@clerk/clerk-react"

export const Route = createFileRoute("/sign-up")({
  component: SignUpPage,
})

function SignUpPage() {
  const { isSignedIn } = useUser()

  if (isSignedIn) {
    window.location.href = "/"
    return null
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center px-5 py-12">
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">Registrieren</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Erstelle ein Konto, um deine Leistungen zu tracken.
          </p>
        </div>
        <SignUp
          routing="hash"
          signInUrl="/sign-in"
          afterSignUpUrl="/"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-card border border-border/60 rounded-3xl shadow-none",
            },
          }}
        />
      </div>
    </main>
  )
}
```

### Step 6: Header / Nav Auth State

Add auth controls to the app header/navigation. Use `SignedIn`, `SignedOut`, and `UserButton` from Clerk.

**Wherever the nav lives (likely in `__root.tsx` shell or a `<Header>` component):**

```tsx
import { SignedIn, SignedOut, UserButton, SignInButton } from "@clerk/clerk-react"
import { Link } from "@tanstack/react-router"

function Header() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/80 backdrop-blur">
      <Link to="/" className="font-extrabold text-lg tracking-tight">
        punchlinequiz
      </Link>

      <nav className="flex items-center gap-3">
        <SignedOut>
          <SignInButton mode="modal">
            <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Anmelden
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "w-8 h-8",
              },
            }}
          />
        </SignedIn>
      </nav>
    </header>
  )
}
```

**`UserButton`** renders a dropdown with: user info, manage account, sign out. No custom code needed for those flows.

### Step 7: Link Game Events to Authenticated Users

Currently, `gameEvents` tracks anonymous sessions via localStorage UUID. After auth, optionally associate events with Clerk user IDs.

**Update `apps/web/src/lib/track.ts`:**

```ts
// getClientSessionId returns Clerk userId if signed in, else localStorage UUID
export function getClientSessionId(): string {
  if (typeof window === "undefined") return "ssr"

  // Try to read Clerk userId from the session
  // The useAuth() hook is the proper way, but for fire-and-forget logging
  // we can check the __session cookie or use a global
  // Simpler: pass userId as a param from the calling component
  let id = window.localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = uuid()
    window.localStorage.setItem(SESSION_KEY, id)
  }
  return id
}
```

**Better approach:** Update `logEvent()` to accept an optional `userId`:

```ts
export function logEvent(name: string, props?: Record<string, unknown>, userId?: string) {
  recordEvent({
    data: {
      sessionId: userId ?? getSessionId(),
      name,
      props: props ?? {},
    },
  }).catch(() => {}) // fire-and-forget
}
```

Components that have access to `useAuth()` pass the userId. Anonymous components pass nothing — falls back to localStorage UUID.

### Step 8: Database Schema — Users Table (Optional)

Clerk owns the user store. We don't need to mirror the full user table. But we may want a local `users` table for:

- Foreign key references (e.g., future leaderboard entries)
- Caching user display names to avoid N+1 Clerk API calls

**Migration: `packages/db/drizzle/0009_add_users.sql`**

```sql
CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(64) PRIMARY KEY,  -- Clerk user ID (e.g., "user_2abc...")
  email       VARCHAR(320),
  name        VARCHAR(200),
  image_url   TEXT,
  role        VARCHAR(16) NOT NULL DEFAULT 'user',  -- "user" | "admin"
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

**Schema addition in `packages/db/src/schema.ts`:**

```ts
export const users = pgTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),  // Clerk user ID
  email: varchar("email", { length: 320 }),
  name: varchar("name", { length: 200 }),
  imageUrl: text("image_url"),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})
```

**Upsert on sign-in:** Use a Clerk webhook (`user.created`, `user.updated`) or upsert in the `verifyAuth` helper.

**Decision: defer this table until leaderboard is built.** For now, Clerk's API is the source of truth. Only add the table when we need JOIN queries (leaderboard, friend lists).

### Step 9: SSO Callback Route

Clerk OAuth redirects (Google, Apple) need a callback route to complete the flow.

**File: `apps/web/src/routes/sso-callback.tsx` (NEW)**

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react"

export const Route = createFileRoute("/sso-callback")({
  component: SSOCallback,
})

function SSOCallback() {
  return (
    <AuthenticateWithRedirectCallback
      continueUrl="/"
    />
  )
}
```

This handles the OAuth redirect exchange. Clerk's `AuthenticateWithRedirectCallback` processes the callback, creates/links the session, and redirects to `continueUrl`.

### Step 10: Clerk Appearance Theming

Clerk components ship with a default light theme. We need to override to match the dark charcoal aesthetic.

**Create `apps/web/src/lib/clerk-theme.ts`:**

```ts
import type { Appearance } from "@clerk/clerk-react"

export const clerkDarkAppearance: Appearance = {
  baseTheme: undefined, // don't use built-in themes
  variables: {
    colorBackground: "#1f1f1f",
    colorInputBackground: "#2a2a2a",
    colorInputText: "#e5e5e5",
    colorPrimary: "#fbbf24",  // gold accent
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

Import and use in every `<SignIn>`, `<SignUp>`, and `<UserButton>`:

```tsx
import { clerkDarkAppearance } from "../lib/clerk-theme"

<SignIn appearance={clerkDarkAppearance} ... />
<UserButton appearance={clerkDarkAppearance} ... />
```

## Migration Plan

### Phase 1: Foundation (this PR)

1. Install packages (`@clerk/tanstack-start`, `@clerk/clerk-react`, `@clerk/backend`)
2. Add env vars to `.env.example` + `.env`
3. Add `ClerkProvider` to `__root.tsx`
4. Create `lib/clerk.ts` and `lib/auth.ts`
5. Create `/sign-in`, `/sign-up`, `/sso-callback` routes
6. Add auth state to header/nav
7. Define `clerkDarkAppearance` theme
8. Test: sign up with email, sign in with Google, sign out, UserButton

### Phase 2: Admin Migration

1. Set `publicMetadata.role = "admin"` on Walde's Clerk user
2. Update admin routes to use `requireAdmin` from `lib/auth.ts`
3. Replace admin login page with Clerk `SignIn`
4. **Keep `PQUIZ_ADMIN_TOKEN` working alongside Clerk** for backward compat with scripts/tools during transition
5. Remove token-based admin auth after confirming Clerk admin flow works
6. Update `lib/session.ts` server functions

### Phase 3: User Features (future)

1. Persist game stats per user (scores, streaks, total played)
2. Leaderboard (weekly resets, top scores)
3. User profile page
4. Clerk webhooks for user lifecycle events

## Backward Compatibility

- **Anonymous play remains unchanged.** The game works without auth. `SignedOut` users see the game, play, share. Auth is only required for stats persistence and leaderboards.
- **Admin token stays during transition.** Both Clerk-based admin AND `PQUIZ_ADMIN_TOKEN` should work until migration is confirmed. Check both: if Clerk auth fails, fall back to token check.
- **Anonymous session IDs remain.** localStorage UUID stays for anonymous event tracking. Clerk userId is used only when available.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `apps/web/package.json` | modify | Add `@clerk/tanstack-start`, `@clerk/clerk-react`, `@clerk/backend` |
| `.env.example` | modify | Add Clerk env vars |
| `apps/web/src/routes/__root.tsx` | modify | Wrap with `ClerkProvider` |
| `apps/web/src/lib/clerk.ts` | **create** | Server-side Clerk client singleton |
| `apps/web/src/lib/auth.ts` | **create** | `verifyAuth()`, `requireAuth()`, `requireAdmin()` |
| `apps/web/src/lib/clerk-theme.ts` | **create** | Dark theme appearance config |
| `apps/web/src/routes/sign-in.tsx` | **create** | User sign-in page |
| `apps/web/src/routes/sign-up.tsx` | **create** | User sign-up page |
| `apps/web/src/routes/sso-callback.tsx` | **create** | OAuth callback handler |
| `apps/web/src/routes/admin/login.tsx` | modify | Replace token form with Clerk `SignIn` |
| `apps/web/src/routes/admin/index.tsx` | modify | Update `beforeLoad` guard |
| `apps/web/src/lib/session.ts` | modify | Add `getAuthFn`, update `isAdminFn` |
| `apps/web/src/lib/track.ts` | modify | Optional userId param for event tracking |
| `apps/web/src/lib/admin.ts` | modify | Deprecate `requireAdmin` (token-based), keep for fallback |

## Open Questions

1. **TanStack Start SSR + ClerkProvider:** Does `@clerk/tanstack-start` provide a Nitro plugin or middleware for automatic session hydration? Need to verify during implementation. If not, `@clerk/clerk-react` + `ClerkProvider` alone may be sufficient since TanStack Start handles SSR differently from Next.js.

2. **Clerk middleware for TanStack Start:** The `@clerk/tanstack-start` package likely provides a `clerkMiddleware` equivalent. Need to check if it's needed or if route-level guards (`beforeLoad`) are sufficient. For MVP, route-level guards are simpler.

3. **Apple Sign-In domain verification:** Apple requires DNS verification for the email relay. This needs to be configured on `punchlinequiz.de` DNS. May take 24-48h to propagate. Can ship without Apple initially and add it after DNS is verified.

4. **Rate limiting:** Clerk handles rate limiting on auth endpoints. No custom implementation needed.

5. **GDPR / DSGVO compliance:** German users expect GDPR compliance. Clerk is DPA-compliant and stores data in EU regions. Verify the Clerk project is configured for EU data residency in the dashboard.
