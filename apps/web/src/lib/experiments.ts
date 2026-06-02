/**
 * Experiment harness (PUN-44). Thin layer over PostHog feature flags.
 *
 * PostHog A/B experiments ARE multivariate feature flags: the flag returns the
 * assigned variant (e.g. "control" | "test"), and posthog-js auto-captures a
 * `$feature_flag_called` exposure the first time you read it — so exposure
 * tracking is automatic, no manual instrumentation needed. You then compare your
 * existing outcome events (e.g. share_clicked, handle_claimed) across variants
 * in the PostHog experiment view.
 *
 * Variant assignment is bootstrapped server-side (see lib/flags.ts + the root
 * loader), so the very first render already has the right variant — no flicker.
 *
 * To launch an experiment safely (guardrails): see docs/posthog.md.
 *
 * No live experiment is configured yet — this is the ready-to-use harness.
 */
import { useEffect, useState } from "react"

import { getFeatureFlag, loadPostHog } from "./posthog"

/** Read an experiment variant synchronously (bootstrap value before SDK load). */
export function getVariant(flagKey: string, fallback = "control"): string {
  const v = getFeatureFlag(flagKey)
  if (typeof v === "string") return v
  if (v === true) return "test"
  if (v === false) return fallback
  return fallback
}

/**
 * React hook: returns the assigned variant for an experiment flag, re-rendering
 * once live flags resolve (in case the bootstrap value was missing). Reading the
 * flag auto-fires the PostHog exposure event.
 */
export function useExperiment(flagKey: string, fallback = "control"): string {
  const [variant, setVariant] = useState(() => getVariant(flagKey, fallback))

  useEffect(() => {
    let active = true
    void loadPostHog().then((ph) => {
      if (!ph || !active) return
      const update = () => active && setVariant(getVariant(flagKey, fallback))
      update()
      // onFeatureFlags fires when flags (re)load; returns an unsubscribe fn.
      return ph.onFeatureFlags(update)
    })
    return () => {
      active = false
    }
  }, [flagKey, fallback])

  return variant
}
