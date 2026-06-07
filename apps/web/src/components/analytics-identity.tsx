import { useUser } from "@clerk/tanstack-react-start"
import { useEffect, useRef } from "react"

import { getOnboardingStatusFn } from "../lib/onboarding"
import { identifyPostHog, resetPostHog } from "../lib/posthog"
import { logEvent } from "../lib/track"

/**
 * Per-tab guard so `auth_session_active` fires once per Clerk sign-in, not on
 * every reload while signed in. Cleared on sign-out so a later sign-in re-fires.
 */
const AUTH_LOGGED_KEY = "pq.auth_active_logged"

/**
 * PostHog identity stitching (PUN-42). Mounted in the root document.
 *
 * On sign-in: `identify(clerkUserId, { email, name, handle })` — this merges the
 * current anonymous distinct id (the bootstrapped pq.session_id) into the Clerk
 * user, so pre-signup play attributes to the account it becomes (the key join
 * point is the post-play sign-up wall on challenges/daily).
 *
 * On sign-out: `reset()` so the next user / anonymous visitor on a shared device
 * does NOT merge into the signed-out account.
 *
 * We deliberately attach PII (email + real name) per the project's no-consent /
 * full-tracking decision — handle is the public display name.
 */
export function AnalyticsIdentity() {
  const { isLoaded, isSignedIn, user } = useUser()
  // The Clerk user id we last called identify() with — guards against
  // re-identifying on every render and lets us detect the sign-out transition.
  const identifiedId = useRef<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return

    if (isSignedIn) {
      if (identifiedId.current === user.id) return
      identifiedId.current = user.id

      // Funnel instrumentation: the missing middle step between
      // `signup_prompt_clicked` and `handle_claimed`. Clerk's modal is a black
      // box and `session_id` was thought to rotate across it — firing here,
      // keyed (inside logEvent) to the persisted anon `pq.session_id`, lets us
      // finally measure Clerk-modal completion (tap → signed-in → onboarded) in
      // our own data. Once per tab so signed-in reloads don't inflate it.
      try {
        if (window.sessionStorage.getItem(AUTH_LOGGED_KEY) !== "1") {
          window.sessionStorage.setItem(AUTH_LOGGED_KEY, "1")
          logEvent("auth_session_active", {})
        }
      } catch {
        logEvent("auth_session_active", {})
      }

      const traits: Record<string, unknown> = {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName,
      }
      // Enrich with our handle (display name) once resolved; identify now so we
      // don't lose the merge if the status call is slow/fails.
      identifyPostHog(user.id, traits)
      getOnboardingStatusFn()
        .then((s) => {
          if (s.signedIn && s.handle && identifiedId.current === user.id) {
            identifyPostHog(user.id, { ...traits, handle: s.handle })
          }
        })
        .catch(() => {})
      return
    }

    // Signed out (or never signed in). Only reset if we had identified someone.
    if (identifiedId.current !== null) {
      identifiedId.current = null
      try {
        window.sessionStorage.removeItem(AUTH_LOGGED_KEY)
      } catch {
        /* storage disabled — best-effort only */
      }
      resetPostHog()
    }
  }, [isLoaded, isSignedIn, user])

  return null
}
