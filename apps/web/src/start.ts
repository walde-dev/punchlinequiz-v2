import { createStart } from "@tanstack/react-start"
import { clerkMiddleware } from "@clerk/tanstack-react-start/server"
import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react"

import { sentryScopeMiddleware } from "./lib/sentry-scope"

export const startInstance = createStart(() => ({
  // Order matters: Clerk establishes auth context; Sentry's global request
  // middleware sets up per-request isolation; our scope middleware then stamps
  // session_id + Clerk user onto that isolated scope.
  requestMiddleware: [clerkMiddleware(), sentryGlobalRequestMiddleware, sentryScopeMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}))
