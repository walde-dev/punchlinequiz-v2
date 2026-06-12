import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { AdminShell } from "../../components/admin-shell"
import { Combobox } from "../../components/combobox"
import {
  deleteDailyChallenge,
  fetchArtists,
  fetchBars,
  fetchDailyChallenges,
  scheduleDailyChallenge,
} from "../../lib/admin-client"
import { isAdminFn } from "../../lib/session"
import type { ComboboxItem } from "../../components/combobox"
import type { ArtistRow, BarRow, DailyRow } from "../../lib/admin-client"

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
  const [items, setItems] = useState<Array<DailyRow>>([])
  const [artists, setArtists] = useState<Array<ArtistRow>>([])
  const [loading, setLoading] = useState(true)
  const [includePast, setIncludePast] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setErr(null)
    try {
      const [d, a] = await Promise.all([
        fetchDailyChallenges({ all: includePast }),
        fetchArtists(),
      ])
      setItems(d.items)
      setArtists(a.items)
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

  const scheduledIds = useMemo(
    () => new Set(items.map((i) => i.punchlineId)),
    [items]
  )
  const scheduledDates = useMemo(
    () => new Set(items.map((i) => i.date)),
    [items]
  )
  const today = todayBerlin()

  return (
    <AdminShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {t("admin.daily.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("admin.daily.subtitle")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={includePast}
              onCheckedChange={(v) => setIncludePast(v === true)}
            />
            {t("admin.daily.includePast")}
          </label>
        </div>

        <ScheduleForm
          artists={artists}
          scheduledIds={scheduledIds}
          scheduledDates={scheduledDates}
          today={today}
          onScheduled={refresh}
        />

        {err && <p className="text-xs text-destructive">{err}</p>}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold tracking-[0.16em] text-foreground/80 uppercase">
            {t("admin.daily.scheduledHeading", { count: items.length })}
          </h2>
          <ul className="flex flex-col divide-y divide-border/40 rounded-2xl border border-border/40 bg-card/40">
            {loading && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t("admin.daily.loading")}
              </li>
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
                    past && "opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-primary tabular-nums">
                          {it.date}
                        </span>
                        {todays && (
                          <span className="rounded-full border border-primary/50 bg-primary/15 px-2 py-0.5 text-[9px] font-bold tracking-wide text-primary uppercase">
                            {t("admin.daily.today")}
                          </span>
                        )}
                        {past && (
                          <span className="rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
                            {t("admin.daily.past")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-snug font-semibold text-foreground">
                        {it.line}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-primary">
                          {it.artistName}
                        </span>
                        <span className="opacity-60"> · {it.songTitle}</span>
                        {it.releaseYear && (
                          <span className="opacity-50">
                            {" "}
                            · {it.releaseYear}
                          </span>
                        )}
                        <span className="opacity-40">
                          {" "}
                          · bar #{it.punchlineId}
                        </span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (
                          !confirm(
                            t("admin.daily.removeConfirm", { date: it.date })
                          )
                        )
                          return
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
      </div>
    </AdminShell>
  )
}

const PAGE_SIZE = 25

function ScheduleForm({
  artists,
  scheduledIds,
  scheduledDates,
  today,
  onScheduled,
}: {
  artists: Array<ArtistRow>
  scheduledIds: Set<number>
  scheduledDates: Set<string>
  today: string
  onScheduled: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState(() => nextOpenDate(today, scheduledDates))
  const [search, setSearch] = useState("")
  const [artistName, setArtistName] = useState("")
  const [artistId, setArtistId] = useState<number | null>(null)
  const [reviewedOnly, setReviewedOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [results, setResults] = useState<{
    items: Array<BarRow>
    total: number
  }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<BarRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    setDate((d) =>
      scheduledDates.has(d) ? nextOpenDate(today, scheduledDates) : d
    )
  }, [scheduledDates, today])

  // Any filter change resets to the first page.
  useEffect(() => {
    setPage(0)
  }, [search, artistId, reviewedOnly, scheduledIds])

  // Server-side, paginated fetch (debounced). Filters + already-scheduled
  // exclusion all happen server-side so the page totals stay accurate.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await fetchBars({
          search: search.trim() || undefined,
          artistId: artistId ?? undefined,
          reviewed: reviewedOnly ? true : undefined,
          excludeIds: scheduledIds.size ? Array.from(scheduledIds) : undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        })
        if (!cancelled) {
          setResults({ items: res.items, total: res.total })
          setErr(null)
        }
      } catch (e) {
        if (!cancelled) {
          setResults({ items: [], total: 0 })
          setErr(String(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [search, artistId, reviewedOnly, scheduledIds, page])

  const candidates = results.items
  const total = results.total
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, total)
  const hasPrev = page > 0
  const hasNext = (page + 1) * PAGE_SIZE < total
  const hasFilters = search.trim() !== "" || artistId != null || reviewedOnly

  function resetFilters() {
    setSearch("")
    setArtistName("")
    setArtistId(null)
    setReviewedOnly(false)
  }

  const dateInvalid = !date || date < today || scheduledDates.has(date)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked || dateInvalid) return
    setBusy(true)
    setErr(null)
    setInfo(null)
    try {
      await scheduleDailyChallenge({ date, punchlineId: picked.id })
      setInfo(
        t("admin.daily.scheduled", {
          artist: picked.artistName,
          song: picked.songTitle,
          date,
        })
      )
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
        <label className="flex flex-col gap-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("admin.daily.date")}
          <Input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="font-mono font-bold tabular-nums"
          />
        </label>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("admin.daily.barSearch")}
          </span>
          <Input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (picked) setPicked(null)
            }}
            placeholder={t("admin.daily.barSearchPlaceholder")}
          />
        </div>
      </div>

      {!picked && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px] flex-1">
            <FilterArtistCombobox
              artists={artists}
              value={artistName}
              onChange={(name) => {
                setArtistName(name)
                if (artistId != null) setArtistId(null)
              }}
              onPick={(a) => {
                setArtistName(a.name)
                setArtistId(a.id)
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={reviewedOnly}
              onCheckedChange={(v) => setReviewedOnly(v === true)}
            />
            {t("admin.daily.reviewedOnly")}
          </label>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-xs font-semibold text-muted-foreground"
            >
              {t("admin.daily.resetFilters")}
            </Button>
          )}
        </div>
      )}

      {dateInvalid && date && (
        <p className="text-xs text-destructive">
          {scheduledDates.has(date)
            ? t("admin.daily.dateTaken")
            : t("admin.daily.datePast")}
        </p>
      )}

      {picked ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-[0.16em] text-primary/80 uppercase">
              {t("admin.daily.selected")}
            </span>
            <p className="text-sm leading-snug font-semibold">{picked.line}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-primary">
                {picked.artistName}
              </span>
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
        <div className="flex flex-col gap-2">
          <ul className="flex max-h-[320px] flex-col divide-y divide-border/40 overflow-y-auto rounded-xl border border-border/40 bg-background/30">
            {candidates.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                {loading ? t("admin.daily.loadingBars") : t("admin.daily.noBar")}
              </li>
            ) : (
              candidates.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(b)}
                    className="flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition-colors hover:bg-card/80"
                  >
                    <span className="text-sm leading-snug font-semibold">
                      {b.line}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-semibold text-primary">
                        {b.artistName}
                      </span>
                      <span className="opacity-60"> · {b.songTitle}</span>
                      <span className="opacity-40"> · #{b.id}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {total > 0 && (
            <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {t("admin.daily.pageInfo", { from, to, total })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!hasPrev || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="text-xs font-semibold"
                >
                  {t("admin.daily.prev")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!hasNext || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs font-semibold"
                >
                  {t("admin.daily.next")}
                </Button>
              </div>
            </div>
          )}
        </div>
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

function FilterArtistCombobox({
  artists,
  value,
  onChange,
  onPick,
}: {
  artists: Array<ArtistRow>
  value: string
  onChange: (v: string) => void
  onPick: (a: ArtistRow) => void
}) {
  const { t } = useTranslation()
  return (
    <Combobox
      value={value}
      onChange={onChange}
      onPick={(item) => {
        const a = artists.find((x) => String(x.id) === item.key)
        if (a) onPick(a)
        else onChange(item.label)
      }}
      minChars={1}
      search={async (q): Promise<Array<ComboboxItem>> => {
        const needle = q.trim().toLowerCase()
        return artists
          .filter((a) => a.name.toLowerCase().includes(needle))
          .slice(0, 50)
          .map((a) => ({
            key: String(a.id),
            label: a.name,
            imageUrl: a.imageUrl,
          }))
      }}
      placeholder={t("admin.daily.filterArtist")}
    />
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
