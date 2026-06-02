/**
 * Shared Axiom ingest helper. Server-only, env-gated, fire-and-forget.
 *
 * Forwarding is a no-op unless both AXIOM_TOKEN and AXIOM_DATASET are set, so
 * local dev and the Vercel preview run with zero observability credentials.
 * Once the Vercel → Axiom log drain is enabled, anything written to the server
 * console (see `log.ts`) also reaches Axiom; this direct path is what lets
 * structured events land in Axiom before/independent of the drain.
 */
export function forwardToAxiom(records: Array<Record<string, unknown>>): void {
  const token = process.env.AXIOM_TOKEN
  const dataset = process.env.AXIOM_DATASET
  if (!token || !dataset || records.length === 0) return

  // Ingest is region-pinned to the dataset's edge deployment. Default to the
  // global host; set AXIOM_URL to the regional edge for non-US datasets, e.g.
  // EU: https://eu-central-1.aws.edge.axiom.co
  const base = process.env.AXIOM_URL ?? "https://api.axiom.co"
  fetch(`${base}/v1/ingest/${encodeURIComponent(dataset)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(records),
  }).catch((e) => console.error("[axiom] forward failed", e))
}
