import { Show } from "@clerk/tanstack-react-start"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { cn } from "@workspace/ui/lib/utils"

import { HANDLE_MAX, HANDLE_MIN, validateHandle } from "../lib/handle"
import { checkHandleFn, claimHandleFn, getOnboardingStatusFn } from "../lib/onboarding"
import { clearReferralToken, getReferralToken } from "../lib/referral-client"
import { clearDesiredHandle, getDesiredHandle } from "../lib/session-progress"
import { logEvent } from "../lib/track"

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

/** Mounted in the root document; only does work once a user is signed in. */
export function OnboardingGate() {
  return (
    <Show when="signed-in">
      <OnboardingFlow />
    </Show>
  )
}

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "bad"; reason: string }

function OnboardingFlow() {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<"loading" | "hidden" | "prompt">("loading")
  const [value, setValue] = useState("")
  const [availability, setAvailability] = useState<Availability>({ state: "idle" })
  const [submitting, setSubmitting] = useState(false)
  const reqId = useRef(0)

  // Resolve onboarding status once on mount.
  useEffect(() => {
    let active = true
    getOnboardingStatusFn()
      .then((s) => {
        if (!active) return
        const needsPrompt = s.signedIn && !s.onboarded
        // Prefill the handle the user typed pre-auth in the session gate / offer
        // (PUN-118), so claiming is a one-tap confirm after sign-in.
        if (needsPrompt) {
          const carried = getDesiredHandle()
          if (carried) setValue(carried)
        }
        setPhase(needsPrompt ? "prompt" : "hidden")
      })
      .catch(() => active && setPhase("hidden"))
    return () => {
      active = false
    }
  }, [])

  // Debounced live availability check.
  useEffect(() => {
    if (phase !== "prompt") return
    const local = validateHandle(value)
    if (!local.ok) {
      setAvailability(value.length === 0 ? { state: "idle" } : { state: "bad", reason: local.reason })
      return
    }
    setAvailability({ state: "checking" })
    const id = ++reqId.current
    const timer = setTimeout(() => {
      checkHandleFn({ data: { handle: value } })
        .then((res) => {
          if (id !== reqId.current) return
          setAvailability(res.available ? { state: "ok" } : { state: "bad", reason: res.reason })
        })
        .catch(() => id === reqId.current && setAvailability({ state: "idle" }))
    }, 350)
    return () => clearTimeout(timer)
  }, [value, phase])

  if (phase !== "prompt") return null

  const canSubmit = availability.state === "ok" && !submitting

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      // Pass the first-touch referral token (if any) so the new account is
      // attributed at onboarding, then clear it (PUN-73).
      const referral = getReferralToken() ?? undefined
      const res = await claimHandleFn({ data: { handle: value, referral } })
      if (res.ok) {
        logEvent("handle_claimed", { handle: res.handle, referred: !!referral })
        // Provisional XP migrated from the anonymous session (PUN-98). This is
        // the cold-open → signup conversion event for the funnel (PUN-101/102).
        if (res.claimedXp && res.claimedXp > 0) {
          logEvent("xp_claimed", { xp: res.claimedXp })
        }
        clearReferralToken()
        clearDesiredHandle()
        setPhase("hidden")
      } else {
        setAvailability({ state: "bad", reason: res.reason })
        setSubmitting(false)
      }
    } catch {
      setSubmitting(false)
    }
  }

  const hint =
    availability.state === "checking"
      ? t("onboarding.checking")
      : availability.state === "ok"
        ? t("onboarding.available")
        : availability.state === "bad"
          ? t(`onboarding.errors.${availability.reason}`)
          : t("onboarding.hint", { min: HANDLE_MIN, max: HANDLE_MAX })

  return (
    // Forced gate: controlled open with a no-op onOpenChange so Esc / outside
    // click can't dismiss it. It only closes by unmounting (phase → "hidden").
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        aria-label={t("onboarding.title")}
        className="max-w-sm gap-5 p-7 text-center sm:max-w-sm"
        style={{
          animation: `pq-pop-in 0.45s ${ease} both`,
          boxShadow: "0 0 60px color-mix(in oklch, var(--primary), transparent 80%)",
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
          {t("onboarding.eyebrow")}
        </span>
        <DialogTitle className="text-2xl font-extrabold tracking-tight text-balance">
          {t("onboarding.title")}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground text-balance">
          {t("onboarding.subtitle")}
        </DialogDescription>

        <div className="flex flex-col gap-2 text-left">
          <InputGroup
            className={cn(
              "h-auto rounded-full px-2 py-1.5",
              availability.state === "ok"
                ? "border-primary/70"
                : availability.state === "bad"
                  ? "border-destructive/60"
                  : "border-border/60",
            )}
          >
            <InputGroupAddon align="inline-start">
              <span className="select-none text-base font-bold text-primary">@</span>
            </InputGroupAddon>
            <InputGroupInput
              autoFocus
              value={value}
              maxLength={HANDLE_MAX}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={t("onboarding.placeholder")}
              className="text-base font-bold tracking-tight placeholder:font-medium placeholder:text-muted-foreground/60"
              aria-label={t("onboarding.title")}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </InputGroup>
          <span
            className={cn(
              "px-1 text-xs",
              availability.state === "ok"
                ? "text-primary"
                : availability.state === "bad"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {hint}
          </span>
        </div>

        <Button
          size="lg"
          disabled={!canSubmit}
          onClick={submit}
          className="cta-glow min-h-12 text-base font-bold disabled:opacity-50"
        >
          {submitting ? t("onboarding.claiming") : t("onboarding.cta")}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
