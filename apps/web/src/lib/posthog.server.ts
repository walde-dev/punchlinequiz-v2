/**
 * Server-side PostHog over plain HTTP. NO SDK on purpose.
 *
 * Like `axiom.ts`, this uses `fetch` against PostHog's public HTTP API rather
 * than `posthog-node`. The Nitro setup inlines all deps and rollup can't bundle
 * some node SDKs (this is exactly what forced Sentry to be client-only — see
 * sentry.client.ts). A fetch wrapper has zero bundling risk and is all we need:
 *  - capture user-attributable server events (PUN-40 decision: system/cron/
 *    Discord events stay in Axiom only, so they are NOT routed here).
 *  - evaluate feature flags for SSR bootstrap so the client renders the right
 *    variant with no flicker (PUN-44).
 *
 * All calls are env-gated (POSTHOG_KEY) and fire-and-forget / best-effort, so a
 * PostHog outage never blocks a request.
 */

const KEY = () => process.env.POSTHOG_KEY
// Real ingest/api host (NOT the /ingest proxy — that's a browser-only concern).
// Defaults to EU to match the rest of the stack (Axiom EU, Sentry de.sentry.io).
const HOST = () => process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com"

/**
 * Capture a server-originated, user-attributable event. `distinctId` should be
 * the Clerk user id when known, else the anonymous `pq_sid` cookie value (see
 * getServerSessionId in log.ts) so it stitches to the same person.
 */
export function capturePostHogServer(
  distinctId: string,
  event: string,
  props: Record<string, unknown> = {},
): void {
  const key = KEY()
  if (!key || !distinctId) return
  fetch(`${HOST()}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: distinctId,
      properties: { ...props, $lib: "pq-server" },
      timestamp: new Date().toISOString(),
    }),
  }).catch((e) => console.error("[posthog] server capture failed", e))
}

/**
 * Server-evaluate feature flags for a distinct id (PUN-44). Returns a map of
 * flag key -> variant (string) or boolean, suitable for posthog-js
 * `bootstrap.featureFlags`. Best-effort: returns {} on any failure so SSR never
 * breaks on analytics.
 */
export async function evaluateFlags(distinctId: string): Promise<Record<string, string | boolean>> {
  const key = KEY()
  if (!key || !distinctId) return {}
  try {
    const res = await fetch(`${HOST()}/flags/?v=2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, distinct_id: distinctId }),
    })
    if (!res.ok) return {}
    const data = (await res.json()) as {
      // Legacy /decide shape.
      featureFlags?: Record<string, string | boolean>
      // /flags?v=2 shape: key -> { enabled, variant }.
      flags?: Record<string, { enabled: boolean; variant?: string | null }>
    }
    if (data.featureFlags) return data.featureFlags
    const out: Record<string, string | boolean> = {}
    for (const [key, detail] of Object.entries(data.flags ?? {})) {
      // Multivariate flags expose a variant string; boolean flags use enabled.
      out[key] = detail.variant ?? detail.enabled
    }
    return out
  } catch {
    return {}
  }
}
