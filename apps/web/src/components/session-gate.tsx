import { Show, SignUpButton } from "@clerk/tanstack-react-start"
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

import { getAnonStandingFn } from "../lib/anon-xp"
import { HANDLE_MAX, validateHandle } from "../lib/handle"
import { checkHandleFn } from "../lib/onboarding"
import { getAnonReferralTeaseFn } from "../lib/referral"
import { setDesiredHandle } from "../lib/session-progress"
import { logEvent } from "../lib/track"

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

/**
 * Escalating 2nd-session signup gate (PUN-118). Fires on session-START while
 * signed out: `hard=false` (session 2) is dismissible once; `hard=true`
 * (session 3+) is a forced wall — sign-in is the only way forward. The offer is
 * rank + identity; the user can type a handle here and we carry it through the
 * Clerk round-trip so OnboardingGate prefills it.
 *
 * Opening is driven by the parent (play.tsx) off the `pq.sessions_completed`
 * counter; this component self-hides for signed-in users.
 */
export function SessionGate({
  open,
  hard,
  onProceed,
}: {
  open: boolean
  hard: boolean
  onProceed: () => void
}) {
  if (!open) return null
  return (
    <Show when="signed-out">
      <SessionGateInner hard={hard} onProceed={onProceed} />
    </Show>
  )
}

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "bad"; reason: string }

function SessionGateInner({
  hard,
  onProceed,
}: {
  hard: boolean
  onProceed: () => void
}) {
  const { t } = useTranslation()
  const [rank, setRank] = useState<number | null>(null)
  const [joined, setJoined] = useState(0)
  const [value, setValue] = useState("")
  const [availability, setAvailability] = useState<Availability>({ state: "idle" })
  const reqId = useRef(0)
  const shownRef = useRef(false)

  // Pull the rank to lead the offer with ("you'd be #X this week"), plus any
  // friends who already joined from this device's share links (PUN-119 tease).
  useEffect(() => {
    let active = true
    getAnonStandingFn()
      .then((r) => active && setRank(r.claimed ? null : r.weeklyRank))
      .catch(() => {})
    getAnonReferralTeaseFn()
      .then((r) => active && setJoined(r.joined))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (shownRef.current) return
    shownRef.current = true
    logEvent("signup_prompt_shown", { source: "gate", hard, rank })
    // rank may still be loading; logged again is not needed — first paint is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced live availability — checkHandleFn works for anon callers, so we can
  // validate the chosen name before the sign-in round-trip.
  useEffect(() => {
    const local = validateHandle(value)
    if (!local.ok) {
      setAvailability(
        value.length === 0 ? { state: "idle" } : { state: "bad", reason: local.reason }
      )
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
  }, [value])

  function onClaim() {
    // Carry a valid, available handle through the Clerk round-trip (PUN-118).
    if (availability.state === "ok") setDesiredHandle(value.trim())
    logEvent("signup_prompt_clicked", { source: "gate", hard, rank })
  }

  function onDismiss() {
    if (hard) return
    logEvent("signup_prompt_dismissed", { source: "gate", rank })
    onProceed()
  }

  const title = rank !== null ? t("sessionGate.titleRank", { rank }) : t("sessionGate.title")
  const hint =
    availability.state === "checking"
      ? t("onboarding.checking")
      : availability.state === "ok"
        ? t("onboarding.available")
        : availability.state === "bad"
          ? t(`onboarding.errors.${availability.reason}`)
          : " "

  return (
    <Dialog open onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent
        showCloseButton={false}
        aria-label={title}
        className="max-w-sm gap-5 p-7 text-center sm:max-w-sm"
        style={{
          animation: `pq-pop-in 0.45s ${ease} both`,
          boxShadow: "0 0 60px color-mix(in oklch, var(--primary), transparent 80%)",
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
          {t("sessionGate.eyebrow")}
        </span>
        <DialogTitle className="text-2xl font-extrabold tracking-tight text-balance">
          {title}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground text-balance">
          {joined > 0 ? t("sessionGate.tease", { joined }) : t("sessionGate.subtitle")}
        </DialogDescription>

        <div className="flex flex-col gap-2 text-left">
          <InputGroup
            className={cn(
              "h-auto rounded-full px-2 py-1.5",
              availability.state === "ok"
                ? "border-primary/70"
                : availability.state === "bad"
                  ? "border-destructive/60"
                  : "border-border/60"
            )}
          >
            <InputGroupAddon align="inline-start">
              <span className="select-none text-base font-bold text-primary">@</span>
            </InputGroupAddon>
            <InputGroupInput
              value={value}
              maxLength={HANDLE_MAX}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("sessionGate.placeholder")}
              className="text-base font-bold tracking-tight placeholder:font-medium placeholder:text-muted-foreground/60"
              aria-label={t("sessionGate.placeholder")}
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
                  : "text-muted-foreground"
            )}
          >
            {hint}
          </span>
        </div>

        <SignUpButton mode="modal">
          <Button
            size="lg"
            onClick={onClaim}
            className="cta-glow min-h-12 text-base font-bold"
          >
            {t("sessionGate.cta")}
            <span aria-hidden="true">→</span>
          </Button>
        </SignUpButton>

        {!hard && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            {t("sessionGate.dismiss")}
          </button>
        )}
      </DialogContent>
    </Dialog>
  )
}
