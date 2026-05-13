import { timingSafeEqual } from "node:crypto"
import { db } from "./db"
import { gameEvents } from "@workspace/db"

export type ApiError = {
  error: string
  message: string
  details?: Record<string, unknown>
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export function errorJson(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return json({ error: code, message, ...(details ? { details } : {}) } satisfies ApiError, status)
}

/** Name of the httpOnly cookie that carries the admin token in browser sessions. */
export const ADMIN_COOKIE = "pquiz_admin"

function constantTimeMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function extractToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? ""
  if (header.startsWith("Bearer ")) {
    const t = header.slice(7).trim()
    if (t) return t
  }
  const cookie = request.headers.get("cookie") ?? ""
  if (!cookie) return null
  for (const part of cookie.split(";")) {
    const [rawName, ...rawVal] = part.split("=")
    const name = rawName?.trim()
    if (name === ADMIN_COOKIE) {
      return decodeURIComponent(rawVal.join("=").trim()) || null
    }
  }
  return null
}

/** Returns true if the request carries a valid admin credential (Bearer or cookie). */
export function isAdminRequest(request: Request): boolean {
  const expected = process.env.PQUIZ_ADMIN_TOKEN
  if (!expected) return false
  const presented = extractToken(request)
  if (!presented) return false
  return constantTimeMatch(presented, expected)
}

/** Constant-time auth via Bearer header OR `pquiz_admin` cookie. Returns Response on failure, null on success. */
export function requireAdmin(request: Request): Response | null {
  const expected = process.env.PQUIZ_ADMIN_TOKEN
  if (!expected) {
    console.error("[admin] PQUIZ_ADMIN_TOKEN is not set on the server")
    return errorJson("server_misconfigured", "Admin token not configured.", 500)
  }
  const presented = extractToken(request)
  if (!presented) return errorJson("unauthorized", "Missing admin token.", 401)
  if (!constantTimeMatch(presented, expected)) {
    return errorJson("unauthorized", "Bad admin token.", 401)
  }
  return null
}

/** Fire-and-forget audit entry into the existing analytics table. */
export function audit(name: string, props: Record<string, unknown>): void {
  db.insert(gameEvents)
    .values({ sessionId: "admin", name: `admin_${name}`, props })
    .catch((e) => console.error("[admin] audit insert failed", e))
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.")
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export function handleError(err: unknown): Response {
  if (err instanceof HttpError) return errorJson(err.code, err.message, err.status, err.details)
  console.error("[admin] unexpected error", err)
  return errorJson("internal_error", "Unexpected server error.", 500)
}

/** Common string sanitization. */
export function requireString(
  v: unknown,
  field: string,
  opts: { max?: number; min?: number } = {},
): string {
  if (typeof v !== "string") throw new HttpError(400, "invalid_field", `${field} must be a string.`)
  const s = v.trim()
  const min = opts.min ?? 1
  const max = opts.max ?? 1000
  if (s.length < min) throw new HttpError(400, "invalid_field", `${field} is required.`)
  if (s.length > max)
    throw new HttpError(400, "invalid_field", `${field} exceeds ${max} characters.`)
  return s
}

export function optionalString(
  v: unknown,
  field: string,
  opts: { max?: number } = {},
): string | undefined {
  if (v === undefined || v === null) return undefined
  return requireString(v, field, { ...opts, min: 1 })
}

export function optionalInt(
  v: unknown,
  field: string,
  opts: { min?: number; max?: number } = {},
): number | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== "number" || !Number.isInteger(v))
    throw new HttpError(400, "invalid_field", `${field} must be an integer.`)
  if (opts.min !== undefined && v < opts.min)
    throw new HttpError(400, "invalid_field", `${field} must be ≥ ${opts.min}.`)
  if (opts.max !== undefined && v > opts.max)
    throw new HttpError(400, "invalid_field", `${field} must be ≤ ${opts.max}.`)
  return v
}

export function optionalStringArray(v: unknown, field: string): string[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) throw new HttpError(400, "invalid_field", `${field} must be an array.`)
  return v.map((item, i) => requireString(item, `${field}[${i}]`))
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
}

export function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, " ").toLowerCase()
}
