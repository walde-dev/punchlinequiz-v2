import { auth } from "@clerk/tanstack-react-start/server"
import { errorJson, hasValidAdminToken } from "./admin"

/**
 * Caller identity for an admin action.
 * - `clerk`: authenticated browser user (Walde, etc.) with admin role in private metadata.
 * - `token`: CLI / script caller authenticated via `Authorization: Bearer $PQUIZ_ADMIN_TOKEN`.
 */
export type Actor =
  | { kind: "clerk"; userId: string; email: string | null; name: string | null }
  | { kind: "token" }

export type AuthResult = { actor: Actor; isAdmin: boolean }

type RoleClaim = {
  metadata?: { role?: string } | null
  email?: string
  name?: string
}

/**
 * Resolve the caller from the active request. Tries Clerk session claims first
 * (networkless via clerkMiddleware), then bearer token. Returns null if neither
 * authenticates.
 */
export async function getActor(request: Request): Promise<AuthResult | null> {
  // 1) Clerk session — request-scoped via the global clerkMiddleware
  const session = await auth()
  if (session.isAuthenticated && session.userId) {
    const claims = (session.sessionClaims ?? {}) as RoleClaim
    return {
      actor: {
        kind: "clerk",
        userId: session.userId,
        email: claims.email ?? null,
        name: claims.name ?? null,
      },
      isAdmin: claims.metadata?.role === "admin",
    }
  }
  // 2) Bearer token — CLI / scripts
  if (hasValidAdminToken(request)) {
    return { actor: { kind: "token" }, isAdmin: true }
  }
  return null
}

/**
 * Require an authenticated admin. Returns the actor or throws a Response
 * (401 for unauthenticated, 403 for non-admin Clerk users).
 */
export async function requireAdmin(request: Request): Promise<Actor> {
  const result = await getActor(request)
  if (!result) {
    throw errorJson("unauthorized", "Anmeldung erforderlich.", 401)
  }
  if (!result.isAdmin) {
    throw errorJson("forbidden", "Admin-Berechtigung erforderlich.", 403)
  }
  return result.actor
}
