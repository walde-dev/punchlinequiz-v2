import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import {
  deleteDailyChallenge,
  fetchBars,
  fetchDailyChallenges,
  scheduleDailyChallenge,
  type BarRow,
  type DailyRow,
} from "../../lib/admin-client"
import { isAdminFn } from "../../lib/session"

export const Route = createFileRoute("/admin/daily")({
  component: AdminDailyPage,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
})

function todayBerlin(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
}

function AdminDailyPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<DailyRow[]>([])
  const [bars, setBars] = useState<BarRow[]>([])
  const [loading, setLoading] = useState(true)
  const [includePast, setIncludePast] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setErr(null)
    try {
      const [d, b] = await Promise.all([
        fetchDailyChallenges({ all: includePast }),
        fetchBars({ limit: 500 }),
      ])
      setItems(d.items)
      setBars(b.items)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includePast])

  const scheduledIds = useMemo(() => new Set(items.map((i) => i.punchlineId)), [items])
  const scheduledDates = useMemo(() => new Set(items.map((i) => i.date)), [items])
  const today = todayBerlin()

  return (
    <div className="relative min-h-svh">
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border/40 bg-background/95 px-5 py-3 md:bg-background/80 md:backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="select-none text-base font-bold tracking-tight">
            <span className="text-foreground">punchline</span>
            <span className="text-primary">/quiz</span>
          </Link>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            {t("admin.daily.badge")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("admin.common.backToBars")}
          </Link>
          <Link
            to="/daily"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("admin.common.playLink")}
          </Link>
        </div>
      </header>

      <main className="relative mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t("admin.daily.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("admin.daily.subtitle")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={includePast}
              onChange={(e) => setIncludePast(e.target.checked)}
              className="accent-primary"
            />
            {t("admin.daily.includePast")}
          </label>
        </div>

        <ScheduleForm
          bars={bars}
          scheduledIds={scheduledIds}
          scheduledDates={scheduledDates}
          today={today}
          onScheduled={refresh}
        />

        {err && <p className="text-xs text-destructive">{err}</p>}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-foreground/80">
            {t("admin.daily.scheduledHeading", { count: items.length })}
          </h2>
          <ul className="flex flex-col divide-y divide-border/40 rounded-2xl border border-border/40 bg-card/40">
            {loading && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t("admin.daily.loading")}</li>
            )}
            {!loading && items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("admin.daily.emptyScheduled")}
              </li>
            )}
            {items.map((it) => {
              const past = it.date < today
              const todays = it.date === today
              return (
                <li
                  key={it.id}
                  className={cn(
                    "flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-card/80",
                    past && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold tabular-nums text-primary">
                          {it.date}
                        </span>
                        {todays && (
                          <span className="rounded-full border border-primary/50 bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                            {t("admin.daily.today")}
                          </span>
                        )}
                        {past && (
                          <span className="rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                            {t("admin.daily.past")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold leading-snug text-foreground">
                        {it.line}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-primary">{it.artistName}</span>
                        <span className="opacity-60"> · {it.songTitle}</span>
                        {it.releaseYear && <span className="opacity-50"> · {it.releaseYear}</span>}
                        <span className="opacity-40"> · bar #{it.punchlineId}</span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (!confirm(t("admin.daily.removeConfirm", { date: it.date }))) return
                        try {
                          await deleteDailyChallenge(it.id)
                          await refresh()
                        } catch (e) {
                          setErr(String(e))
                        }
                      }}
                      className="shrink-0 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    >
                      {t("admin.common.remove")}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </main>
    </div>
  )
}

function ScheduleForm({
  bars,
  scheduledIds,
  scheduledDates,
  today,
  onScheduled,
}: {
  bars: BarRow[]
  scheduledIds: Set<number>
  scheduledDates: Set<string>
  today: string
  onScheduled: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState(() => nextOpenDate(today, scheduledDates))
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<BarRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    setDate((d) => (scheduledDates.has(d) ? nextOpenDate(today, scheduledDates) : d))
  }, [scheduledDates, today])

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bars
      .filter((b) => b.active)
      .filter((b) => !scheduledIds.has(b.id))
      .filter((b) => {
        if (!q) return true
        return (
          b.line.toLowerCase().includes(q) ||
          b.artistName.toLowerCase().includes(q) ||
          b.songTitle.toLowerCase().includes(q) ||
          String(b.id) === q
        )
      })
      .slice(0, 30)
  }, [bars, scheduledIds, search])

  const dateInvalid = !date || date < today || scheduledDates.has(date)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked || dateInvalid) return
    setBusy(true)
    setErr(null)
    setInfo(null)
    try {
      await scheduleDailyChallenge({ date, punchlineId: picked.id })
      setInfo(t("admin.daily.scheduled", { artist: picked.artistName, song: picked.songTitle, date }))
      setPicked(null)
      setSearch("")
      await onScheduled()
    } catch (e2) {
      setErr(String(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/60 p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("admin.daily.date")}
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-mono font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
        </label>
        <div className="flex-1 min-w-[220px] flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("admin.daily.barSearch")}
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (picked) setPicked(null)
            }}
            placeholder={t("admin.daily.barSearchPlaceholder")}
            className="rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
        </div>
      </div>

      {dateInvalid && date && (
        <p className="text-xs text-destructive">
          {scheduledDates.has(date) ? t("admin.daily.dateTaken") : t("admin.daily.datePast")}
        </p>
      )}

      {picked ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary/80">
              {t("admin.daily.selected")}
            </span>
            <p className="text-sm font-semibold leading-snug">{picked.line}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-primary">{picked.artistName}</span>
              <span className="opacity-60"> · {picked.songTitle}</span>
              <span className="opacity-40"> · #{picked.id}</span>
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPicked(null)}
            className="shrink-0 text-xs font-semibold"
          >
            {t("admin.daily.change")}
          </Button>
        </div>
      ) : (
        <ul className="flex max-h-[320px] flex-col divide-y divide-border/40 overflow-y-auto rounded-xl border border-border/40 bg-background/30">
          {candidates.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              {bars.length === 0 ? t("admin.daily.loadingBars") : t("admin.daily.noBar")}
            </li>
          ) : (
            candidates.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setPicked(b)}
                  className="flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition-colors hover:bg-card/80"
                >
                  <span className="text-sm font-semibold leading-snug">{b.line}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-semibold text-primary">{b.artistName}</span>
                    <span className="opacity-60"> · {b.songTitle}</span>
                    <span className="opacity-40"> · #{b.id}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}
      {info && <p className="text-xs text-primary">{info}</p>}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={busy || !picked || dateInvalid}
          className="font-bold"
        >
          {busy ? "…" : t("admin.daily.schedule")}
        </Button>
      </div>
    </form>
  )
}

function nextOpenDate(today: string, taken: Set<string>): string {
  // Find first date >= today that isn't taken. Reasonable cap to avoid loops.
  const base = new Date(`${today}T00:00:00`)
  for (let i = 0; i < 365; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    if (!taken.has(iso)) return iso
  }
  return today
}
