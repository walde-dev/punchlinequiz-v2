import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { AdminShell } from "../../components/admin-shell"
import { rankIconPath } from "../../lib/rank-icon"
import { isAdminFn } from "../../lib/session"

export const Route = createFileRoute("/admin/levels")({
  component: AdminLevelsPage,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
})

type LevelRow = {
  id?: number
  threshold: number
  nameDe: string
  nameEn: string
  accent: string
}

/**
 * Badge filename slot — always derived from the row's POSITION in the
 * threshold-sorted list, never from the DB `id`. This keeps badges stable
 * even when admins delete and re-insert levels (DB serial ids drift).
 */
function previewSlot(_row: LevelRow, index: number): number {
  return index + 1
}

function AdminLevelsPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<LevelRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/admin/levels", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setRows(d.items as LevelRow[]))
      .catch((e) => setErr(String(e)))
  }, [])

  function update(i: number, patch: Partial<LevelRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  function addRow() {
    const last = rows[rows.length - 1]
    const nextThreshold = last ? last.threshold + Math.max(500, Math.round(last.threshold * 0.6)) : 0
    setRows((r) => [
      ...r,
      { threshold: nextThreshold, nameDe: "", nameEn: "", accent: "primary" },
    ])
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i))
  }

  async function onSave() {
    setSaving(true)
    setErr(null)
    setSaved(false)
    try {
      const payload = {
        levels: rows.map((r) => ({
          threshold: r.threshold,
          nameDe: r.nameDe,
          nameEn: r.nameEn,
          accent: r.accent || "primary",
        })),
      }
      const res = await fetch("/api/admin/levels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).message || `HTTP ${res.status}`)
      const json = await res.json()
      setRows(json.items as LevelRow[])
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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
            {t("admin.levels.eyebrow")}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("admin.levels.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.levels.subtitle")}</p>
        </header>

        {err && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {err}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[3rem_6rem_1fr_1fr_5rem_3rem] gap-3 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <span />
            <span>{t("admin.levels.col.threshold")}</span>
            <span>{t("admin.levels.col.nameDe")}</span>
            <span>{t("admin.levels.col.nameEn")}</span>
            <span>{t("admin.levels.col.accent")}</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div
              key={r.id ?? `new-${i}`}
              className="grid grid-cols-[3rem_6rem_1fr_1fr_5rem_3rem] items-center gap-3 rounded-2xl border border-border/40 bg-card/30 px-3 py-2"
            >
              <img
                src={rankIconPath(previewSlot(r, i))}
                alt=""
                aria-hidden="true"
                width={40}
                height={40}
                className="select-none"
                style={{
                  filter:
                    "drop-shadow(0 0 10px color-mix(in oklch, var(--primary), transparent 65%))",
                }}
                onError={(e) => {
                  // Levels added beyond rank-10 don't ship a badge — hide
                  // the broken image cleanly.
                  ;(e.currentTarget as HTMLImageElement).style.visibility = "hidden"
                }}
              />
              <input
                type="number"
                min={0}
                step={50}
                value={r.threshold}
                onChange={(e) => update(i, { threshold: Number(e.target.value) })}
                className="h-9 rounded-full border border-border/60 bg-background/60 px-3 text-right font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              <input
                type="text"
                value={r.nameDe}
                onChange={(e) => update(i, { nameDe: e.target.value })}
                className="h-9 rounded-full border border-border/60 bg-background/60 px-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                placeholder="Rookie"
              />
              <input
                type="text"
                value={r.nameEn}
                onChange={(e) => update(i, { nameEn: e.target.value })}
                className="h-9 rounded-full border border-border/60 bg-background/60 px-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                placeholder="Rookie"
              />
              <input
                type="text"
                value={r.accent}
                onChange={(e) => update(i, { accent: e.target.value })}
                className="h-9 rounded-full border border-border/60 bg-background/60 px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className={cn(
                  "h-9 rounded-full border border-border/40 text-sm font-bold text-muted-foreground",
                  "hover:border-destructive/40 hover:text-destructive",
                )}
                aria-label={t("admin.levels.removeAria")}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="self-start rounded-full border border-dashed border-border/40 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            + {t("admin.levels.addRow")}
          </button>
        </div>

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="text-xs font-bold text-primary">✓ {t("admin.levels.saved")}</span>
          )}
          <Button
            onClick={onSave}
            disabled={saving}
            className="cta-glow min-h-12 px-7 font-bold"
          >
            {saving ? "…" : t("admin.levels.save")}
          </Button>
        </div>
      </div>
    </AdminShell>
  )
}
