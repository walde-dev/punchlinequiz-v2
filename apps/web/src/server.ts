// Sentry server init MUST run before the request handler is imported.
import "./instrument.server"

import { wrapFetchWithSentry } from "@sentry/tanstackstart-react"
import handler, { createServerEntry } from "@tanstack/react-start/server-entry"

/**
 * Custom server entry: wraps the default TanStack Start fetch handler with
 * Sentry so unhandled server errors are captured. When SENTRY_DSN is unset,
 * `wrapFetchWithSentry` is an effective passthrough (init no-op'd).
 */
export default createServerEntry(
  wrapFetchWithSentry({
    fetch(request: Request) {
      return handler.fetch(request)
    },
  }),
)
