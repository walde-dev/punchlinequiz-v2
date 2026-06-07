import { GoogleOneTap, Show } from "@clerk/tanstack-react-start"
import { useEffect } from "react"

import { logEvent } from "../lib/track"

/**
 * Google One Tap — the friction-free signup path (PUN-139).
 *
 * Diagnosis (launch #2 funnel): of anon players who hit the hard signup wall and
 * tapped the gold CTA, ~76% click but only ~24% finish. They die *inside Clerk's
 * modal*, which requires email + password + an emailed OTP code — a leave-the-app
 * verification step that's brutal on mobile, and our whole audience is mobile.
 * `oauth_google` is already enabled on the Clerk instance but it's buried as one
 * button inside that modal.
 *
 * One Tap surfaces a zero-field, no-OTP, no-password path: one tap → signed in →
 * OnboardingGate claims the handle. Mounted globally so it can convert *before*
 * the wall (passively) as well as at it.
 *
 * Renders only for signed-out visitors who have a live Google session; otherwise
 * Clerk renders nothing (so signed-in users and Google-less visitors see no UI).
 * `itpSupport`/`fedCmSupport` keep it working under iOS Safari's tracking
 * prevention. Default redirect returns the user to the current page, so a player
 * deep in a challenge/daily isn't bounced away.
 */
function GoogleOneTapInner() {
  useEffect(() => {
    // Exposure population for the One Tap arm of the signup funnel; conversion is
    // measured downstream by auth_session_active → handle_claimed.
    logEvent("google_one_tap_mounted", {})
  }, [])

  return <GoogleOneTap cancelOnTapOutside itpSupport fedCmSupport />
}

export function GoogleOneTapPrompt() {
  return (
    <Show when="signed-out">
      <GoogleOneTapInner />
    </Show>
  )
}
