import { Show } from "@clerk/tanstack-react-start"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { AdminShell } from "../../components/admin-shell"
import { getAnonXpTotalFn } from "../../lib/anon-xp"
import { isFirstRun, resetFirstRun } from "../../lib/first-run"
import { resetMyOnboardingFn } from "../../lib/onboarding"
import { isAdminFn } from "../../lib/session"

export const Route = createFileRoute("/admin/onboarding")({
  component: AdminOnboardingPage,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
})

function AdminOnboardingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [firstRun, setFirstRun] = useState<boolean | null>(null)
  const [banked, setBanked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setFirstRun(isFirstRun())
    getAnonXpTotalFn()
      .then((r) => setBanked(r.claimed ? 0 : r.total))
      .catch(() => setBanked(null))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function doReset(replay: boolean) {
    resetFirstRun()
    if (replay) {
      navigate({ to: "/play" })
      return
    }
    setMsg(t("admin.onboarding.didReset"))
    setTimeout(refresh, 60)
  }

  async function resetAccount() {
    if (!window.confirm(t("admin.onboarding.resetAccountConfirm"))) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await resetMyOnboardingFn()
      setMsg(r.ok ? t("admin.onboarding.accountReset") : t("admin.onboarding.accountResetFail"))
    } catch {
      setMsg(t("admin.onboarding.accountResetFail"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
            {t("admin.onboarding.eyebrow")}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("admin.onboarding.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.onboarding.subtitle")}</p>
        </header>

        {/* Live state */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={t("admin.onboarding.stateFirstRun")}
            value={firstRun === null ? "…" : firstRun ? t("admin.onboarding.yes") : t("admin.onboarding.no")}
            good={firstRun === true}
          />
          <StatCard
            label={t("admin.onboarding.stateBanked")}
            value={banked === null ? "…" : `${banked} XP`}
          />
        </div>

        {/* Anonymous cold-open reset */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-5">
          <h2 className="text-sm font-bold tracking-tight">{t("admin.onboarding.coldOpenTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("admin.onboarding.coldOpenBody")}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => doReset(true)} className="font-bold">
              {t("admin.onboarding.resetReplay")}
            </Button>
            <Button variant="ghost" onClick={() => doReset(false)}>
              {t("admin.onboarding.resetOnly")}
            </Button>
          </div>
          <Show when="signed-in">
            <p className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              {t("admin.onboarding.signedInNote")}
            </p>
          </Show>
        </section>

        {/* Signup-claim reset (signed-in only) */}
        <Show when="signed-in">
          <section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
            <h2 className="text-sm font-bold tracking-tight">{t("admin.onboarding.accountTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("admin.onboarding.accountBody")}</p>
            <div>
              <Button
                variant="ghost"
                onClick={resetAccount}
                disabled={busy}
                className="font-bold text-destructive hover:bg-destructive/10"
              >
                {busy ? "…" : t("admin.onboarding.resetAccount")}
              </Button>
            </div>
          </section>
        </Show>

        {msg && (
          <p className="text-sm font-semibold text-primary" role="status" aria-live="polite">
            {msg}
          </p>
        )}
      </div>
    </AdminShell>
  )
}

function StatCard({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card/40 px-4 py-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-lg font-extrabold tracking-tight", good ? "text-primary" : "text-foreground")}>
        {value}
      </span>
    </div>
  )
}
