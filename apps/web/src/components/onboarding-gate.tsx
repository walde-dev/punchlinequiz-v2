import { Show } from "@clerk/tanstack-react-start"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { HANDLE_MAX, HANDLE_MIN, validateHandle } from "../lib/handle"
import { checkHandleFn, claimHandleFn, getOnboardingStatusFn } from "../lib/onboarding"
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
        setPhase(s.signedIn && !s.onboarded ? "prompt" : "hidden")
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
      const res = await claimHandleFn({ data: { handle: value } })
      if (res.ok) {
        logEvent("handle_claimed", { handle: res.handle })
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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.title")}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-border/60 bg-card/90 p-7 text-center"
        style={{
          animation: `pq-pop-in 0.45s ${ease} both`,
          boxShadow: "0 0 60px color-mix(in oklch, var(--primary), transparent 80%)",
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
          {t("onboarding.eyebrow")}
        </span>
        <h2 className="text-2xl font-extrabold tracking-tight text-balance">{t("onboarding.title")}</h2>
        <p className="text-sm text-muted-foreground text-balance">{t("onboarding.subtitle")}</p>

        <div className="flex flex-col gap-2 text-left">
          <div
            className={cn(
              "flex items-center gap-1 rounded-full border bg-background/60 px-4 py-3 transition-colors",
              availability.state === "ok"
                ? "border-primary/70"
                : availability.state === "bad"
                  ? "border-destructive/60"
                  : "border-border/60 focus-within:border-primary/60",
            )}
          >
            <span className="select-none text-base font-bold text-primary">@</span>
            <input
              autoFocus
              value={value}
              maxLength={HANDLE_MAX}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={t("onboarding.placeholder")}
              className="min-w-0 flex-1 bg-transparent text-base font-bold tracking-tight text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/60"
              aria-label={t("onboarding.title")}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
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
      </div>
    </div>
  )
}
