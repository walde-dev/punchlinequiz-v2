/**
 * First-touch acquisition capture (PUN-121). Records WHERE a player came from in
 * our own adblock-proof log, so "which channel converts" is answerable from
 * game_events instead of falling back to PostHog's (undercounted) referrer.
 *
 * Storage model (per the ticket): first-touch persisted in localStorage AND a
 * dedicated `session_started` event with full fidelity; plus the coarse `source`
 * bucket stamped on every event (see track.ts) for join-free slicing.
 *
 * PII note: the user opted into full referrer/URL/path fidelity (consistent with
 * the PostHog PII stance), accepting GDPR risk. `redact()` is the guardrail — it
 * strips obvious secrets/emails and caps length so we never log tokens.
 */

const FIRST_TOUCH_KEY = "pq.first_touch"
const SESSION_STARTED_KEY = "pq.session_started" // sessionStorage: once per tab

export type FirstTouch = {
  /** Coarse bucket: reddit | search | share | direct | internal | referral | <utm_source>. */
  source: string
  referrer: string
  landingPath: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  ts: string
}

/** Strip emails + obvious secret query values and cap length (PII guardrail). */
function redact(s: string, max = 300): string {
  return s
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, "[email]")
    .replace(/([?&](?:token|secret|key|auth|sig|password|pwd)=)[^&#]+/gi, "$1[redacted]")
    .slice(0, max)
}

function bucketFor(referrerHost: string, params: URLSearchParams): string {
  if (params.get("r") || params.get("i")) return "share"
  const utm = (params.get("utm_source") ?? "").toLowerCase()
  if (utm) return utm.includes("reddit") ? "reddit" : utm
  const h = referrerHost.toLowerCase()
  if (!h) return "direct"
  if (h.includes("reddit")) return "reddit"
  if (/(google|bing|duckduckgo|ecosia|yahoo)\./.test(h)) return "search"
  if (h.includes("punchlinequiz")) return "internal"
  return "referral"
}

/** Capture (once) and return the device's first-touch attribution. First-touch wins. */
export function captureFirstTouch(): FirstTouch | null {
  if (typeof window === "undefined") return null
  try {
    const existing = window.localStorage.getItem(FIRST_TOUCH_KEY)
    if (existing) return JSON.parse(existing) as FirstTouch

    const params = new URLSearchParams(window.location.search)
    let referrerHost = ""
    try {
      referrerHost = document.referrer ? new URL(document.referrer).host : ""
    } catch {
      /* malformed referrer — leave blank */
    }
    const ft: FirstTouch = {
      source: bucketFor(referrerHost, params),
      referrer: redact(document.referrer || ""),
      landingPath: redact(window.location.pathname + window.location.search),
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      ts: new Date().toISOString(),
    }
    window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(ft))
    return ft
  } catch {
    return null
  }
}

export function getFirstTouch(): FirstTouch | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(FIRST_TOUCH_KEY)
    return raw ? (JSON.parse(raw) as FirstTouch) : null
  } catch {
    return null
  }
}

let sourceCache: string | null | undefined
/** The coarse first-touch source bucket, cached — stamped on every event. */
export function firstTouchSource(): string | null {
  if (sourceCache !== undefined) return sourceCache
  sourceCache = getFirstTouch()?.source ?? null
  return sourceCache
}

/** True exactly once per tab session — gates the dedicated session_started event. */
export function firstSessionStartThisTab(): boolean {
  if (typeof window === "undefined") return false
  try {
    if (window.sessionStorage.getItem(SESSION_STARTED_KEY)) return false
    window.sessionStorage.setItem(SESSION_STARTED_KEY, "1")
    return true
  } catch {
    return false
  }
}
