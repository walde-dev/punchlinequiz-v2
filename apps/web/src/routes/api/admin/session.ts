import { createFileRoute } from "@tanstack/react-router"
import { timingSafeEqual } from "node:crypto"

import {
  ADMIN_COOKIE,
  audit,
  errorJson,
  handleError,
  HttpError,
  isAdminRequest,
  json,
  readJsonBody,
  requireString,
} from "../../../lib/admin"

const MAX_AGE_DAYS = 30

function cookieAttrs(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (process.env.NODE_ENV === "production") parts.push("Secure")
  return parts.join("; ")
}

export const Route = createFileRoute("/api/admin/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return json({ admin: isAdminRequest(request) })
      },
      POST: async ({ request }) => {
        try {
          const expected = process.env.PQUIZ_ADMIN_TOKEN
          if (!expected) {
            return errorJson("server_misconfigured", "Admin token not configured.", 500)
          }
          const body = await readJsonBody<Record<string, unknown>>(request)
          const token = requireString(body.token, "token", { max: 256 })
          const a = Buffer.from(token)
          const b = Buffer.from(expected)
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            throw new HttpError(401, "unauthorized", "Bad admin token.")
          }
          audit("session_started", {})
          return new Response(JSON.stringify({ admin: true }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": cookieAttrs(token, MAX_AGE_DAYS * 24 * 60 * 60),
            },
          })
        } catch (err) {
          return handleError(err)
        }
      },
      DELETE: async ({ request }) => {
        const wasAdmin = isAdminRequest(request)
        if (wasAdmin) audit("session_ended", {})
        return new Response(JSON.stringify({ admin: false }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": cookieAttrs("", 0),
          },
        })
      },
    },
  },
})
