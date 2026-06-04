import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { AdminShell } from "../../components/admin-shell"
import { isAdminFn } from "../../lib/session"

export const Route = createFileRoute("/admin/xp")({
  component: AdminXpPage,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
})

type XpConfigRow = {
  id: number
  xpArtistCorrect: number
  xpClozeCorrect: number
  xpSongBonus: number
  xpDailyArtist: number
  xpDailySong: number
  xpDailyPerfectBonus: number
  streakBonusPerStep: number
  streakMaxBonus: number
  streakIdleResetMinutes: number
  minSecondsBetweenAttempts: number
  xpSubmissionAccepted: number
  xpReferralReferrer: number
  xpReferralReferee: number
  referralDailyCap: number
}

const FIELDS: Array<{
  key: keyof XpConfigRow
  labelKey: string
  hintKey: string
}> = [
  { key: "xpArtistCorrect", labelKey: "admin.xp.fields.artist", hintKey: "admin.xp.hints.artist" },
  { key: "xpClozeCorrect", labelKey: "admin.xp.fields.cloze", hintKey: "admin.xp.hints.cloze" },
  { key: "xpSongBonus", labelKey: "admin.xp.fields.songBonus", hintKey: "admin.xp.hints.songBonus" },
  { key: "xpDailyArtist", labelKey: "admin.xp.fields.dailyArtist", hintKey: "admin.xp.hints.dailyArtist" },
  { key: "xpDailySong", labelKey: "admin.xp.fields.dailySong", hintKey: "admin.xp.hints.dailySong" },
  { key: "xpDailyPerfectBonus", labelKey: "admin.xp.fields.dailyPerfect", hintKey: "admin.xp.hints.dailyPerfect" },
  { key: "streakBonusPerStep", labelKey: "admin.xp.fields.streakStep", hintKey: "admin.xp.hints.streakStep" },
  { key: "streakMaxBonus", labelKey: "admin.xp.fields.streakMax", hintKey: "admin.xp.hints.streakMax" },
  { key: "streakIdleResetMinutes", labelKey: "admin.xp.fields.streakIdle", hintKey: "admin.xp.hints.streakIdle" },
  { key: "minSecondsBetweenAttempts", labelKey: "admin.xp.fields.minCooldown", hintKey: "admin.xp.hints.minCooldown" },
  { key: "xpSubmissionAccepted", labelKey: "admin.xp.fields.submissionAccepted", hintKey: "admin.xp.hints.submissionAccepted" },
  { key: "xpReferralReferrer", labelKey: "admin.xp.fields.referralReferrer", hintKey: "admin.xp.hints.referralReferrer" },
  { key: "xpReferralReferee", labelKey: "admin.xp.fields.referralReferee", hintKey: "admin.xp.hints.referralReferee" },
  { key: "referralDailyCap", labelKey: "admin.xp.fields.referralDailyCap", hintKey: "admin.xp.hints.referralDailyCap" },
]

function AdminXpPage() {
  const { t } = useTranslation()
  const [row, setRow] = useState<XpConfigRow | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/admin/xp-config", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setRow(d))
      .catch((e) => setErr(String(e)))
  }, [])

  async function onSave() {
    if (!row) return
    setSaving(true)
    setErr(null)
    setSaved(false)
    try {
      const res = await fetch("/api/admin/xp-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(row),
      })
      if (!res.ok) throw new Error((await res.json()).message || `HTTP ${res.status}`)
      const updated = await res.json()
      setRow(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
            {t("admin.xp.eyebrow")}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("admin.xp.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.xp.subtitle")}</p>
        </header>

        {err && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {err}
          </p>
        )}

        {row ? (
          <div className="flex flex-col gap-3">
            {FIELDS.map((f) => (
              <label
                key={f.key as string}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/40 bg-card/30 px-4 py-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{t(f.labelKey)}</span>
                  <span className="text-[11px] text-muted-foreground">{t(f.hintKey)}</span>
                </span>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={row[f.key] as number}
                  onChange={(e) =>
                    setRow({ ...row, [f.key]: Number(e.target.value) })
                  }
                  className="w-28 text-right font-bold tabular-nums"
                />
              </label>
            ))}

            <div className="mt-2 flex items-center justify-end gap-3">
              {saved && (
                <span className="text-xs font-bold text-primary">✓ {t("admin.xp.saved")}</span>
              )}
              <Button
                onClick={onSave}
                disabled={saving}
                className="cta-glow min-h-12 px-7 font-bold"
              >
                {saving ? "…" : t("admin.xp.save")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p>
        )}
      </div>
    </AdminShell>
  )
}
