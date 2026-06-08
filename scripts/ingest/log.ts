import { forwardToAxiom } from "../../apps/web/src/lib/axiom.ts"

/**
 * Structured logging for the ingestion pipeline (PUN-167, CLAUDE.md rules).
 * Reuses the app's `forwardToAxiom` (no-op when AXIOM_TOKEN/DATASET are absent)
 * so a `run_id` in Axiom reconstructs a full run timeline. Also prints JSON
 * locally for live CLI visibility.
 */
let currentRunId = "ingest-unset"

export function startRun(): string {
  currentRunId = `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return currentRunId
}

export function logEvent(event: string, props: Record<string, unknown> = {}): void {
  const record = {
    event,
    run_id: currentRunId,
    source: "youtube_whodat",
    timestamp: new Date().toISOString(),
    ...props,
  }
  // Local visibility (one structured line per event).
  console.log(JSON.stringify(record))
  // Fire-and-forget to Axiom.
  forwardToAxiom([record])
}
