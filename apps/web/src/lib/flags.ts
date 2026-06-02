import { createServerFn } from "@tanstack/react-start"

import { getServerSessionId } from "./log"
import { evaluateFlags } from "./posthog.server"

export type BootstrapFlags = Record<string, string | boolean>

/**
 * Server-evaluate the current visitor's feature flags for SSR bootstrap (PUN-44).
 *
 * Called by the root route loader; the result is injected into the initial HTML
 * (window.__PH_BOOTSTRAP__) so posthog-js initialises with the right variant
 * assignments already known — no flag flicker on the first paint.
 *
 * Keyed on the anonymous pq_sid cookie (pre-identify distinct id). No-op (returns
 * {}) until POSTHOG_KEY is set, so this is free until a real experiment exists.
 */
export const getBootstrapFlagsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BootstrapFlags> => {
    const sid = getServerSessionId()
    if (!sid) return {}
    return evaluateFlags(sid)
  },
)
