import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { AdminShell } from "../../components/admin-shell"
import { DifficultyHistogram, PlaysOverTime, TopArtistsBar } from "../../components/analytics-charts"
import { ArtistDetailDrawer, LineDetailDrawer } from "../../components/analytics-detail"
import { isAdminFn } from "../../lib/session"
import { getAnalyticsBundle } from "../../lib/analytics"
import type { TopArtistDatum } from "../../components/analytics-charts"
import type { AnalyticsBundle, ArtistRow, DateRange, LineRow } from "../../lib/analytics"

export const Route = createFileRoute("/admin/analytics")({
  component: AnalyticsPage,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
  loader: async () => getAnalyticsBundle({ data: { from: null, to: null } }),
})

// ─── Date presets ─────────────────────────────────────────────────────────────

type PresetKey = "all" | "7d" | "30d"

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function rangeFor(preset: PresetKey): DateRange {
  if (preset === "all") return { from: null, to: null }
  const days = preset === "7d" ? 6 : 29
  return { from: isoDaysAgo(days), to: new Date().toISOString().slice(0, 10) }
}

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: "all", label: "Gesamt" },
  { key: "30d", label: "30 Tage" },
  { key: "7d", label: "7 Tage" },
]

// ─── Formatting ───────────────────────────────────────────────────────────────

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`
}

// Gold marks what the admin is hunting for: the hard lines. Single accent —
// no second color. Easy/normal lines stay neutral so the gold ones pop.
function rateTone(rate: number | null): string {
  if (rate === null) return "text-muted-foreground/40"
  if (rate < 0.34) return "text-primary"
  return "text-foreground"
}

function RateCell({ rate, correct, plays }: { rate: number | null; correct: number; plays: number }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className={cn("text-sm font-bold tabular-nums", rateTone(rate))}>{pct(rate)}</span>
      <span className="text-[10px] tabular-nums text-muted-foreground/60">
        {plays === 0 ? "—" : `${correct}/${plays}`}
      </span>
    </div>
  )
}

// ─── Sortable header ────────────────────────────────────────────────────────────

type Sort<TKey extends string> = { key: TKey; dir: "asc" | "desc" }

function SortHead<TKey extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: TKey
  sort: Sort<TKey>
  onSort: (k: TKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active && "text-primary",
        )}
      >
        {label}
        <span className={cn("text-[9px] transition-opacity", active ? "opacity-100" : "opacity-0")}>
          {sort.dir === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </TableHead>
  )
}

function useSort<TKey extends string>(initial: TKey) {
  const [sort, setSort] = useState<Sort<TKey>>({ key: initial, dir: "desc" })
  const onSort = (k: TKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "desc" ? "asc" : "desc" } : { key: k, dir: "desc" }))
  return { sort, onSort }
}

function cmp(a: number | null, b: number | null, dir: "asc" | "desc"): number {
  const av = a ?? -1
  const bv = b ?? -1
  return dir === "desc" ? bv - av : av - bv
}

/** Make a clickable row reachable by keyboard (Enter/Space), not just mouse. */
function activate(fn: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        fn()
      }
    },
  }
}

// ─── Page ───────────────────────────────────────────────────────────────────────

function AnalyticsPage() {
  const initial = Route.useLoaderData()
  const [bundle, setBundle] = useState<AnalyticsBundle>(initial)
  const [preset, setPreset] = useState<PresetKey>("all")
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<"lines" | "artists">("lines")
  const [topMetric, setTopMetric] = useState<"pull" | "recognition">("pull")
  const [search, setSearch] = useState("")
  const [lineDrawer, setLineDrawer] = useState<number | null>(null)
  const [artistDrawer, setArtistDrawer] = useState<number | null>(null)

  const range = useMemo(() => rangeFor(preset), [preset])

  // Refetch on range change (initial all-time comes from the loader).
  useEffect(() => {
    if (preset === "all" && bundle === initial) return
    let cancelled = false
    setLoading(true)
    getAnalyticsBundle({ data: range })
      .then((b) => {
        if (!cancelled) setBundle(b)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range])

  const topArtists: Array<TopArtistDatum> = useMemo(() => {
    const sorted = [...bundle.artists]
    if (topMetric === "pull") sorted.sort((a, b) => b.pullSessions - a.pullSessions)
    else sorted.sort((a, b) => (b.recognition.rate ?? -1) - (a.recognition.rate ?? -1))
    return sorted
      .filter((a) => (topMetric === "pull" ? a.pullSessions > 0 : a.recognition.plays > 0))
      .slice(0, 8)
      .map((a) => ({
        artistId: a.artistId,
        name: a.artistName,
        value: topMetric === "pull" ? a.pullSessions : Math.round((a.recognition.rate ?? 0) * 100),
        suffix: topMetric === "pull" ? "" : "%",
      }))
  }, [bundle.artists, topMetric])

  return (
    <AdminShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Wie performt jede Line — und welche Artists ziehen.{" "}
              {loading && <span className="text-primary">aktualisiere…</span>}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border/50 bg-card/40 p-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/50",
                  preset === p.key
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </header>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Sessions" value={bundle.totals.sessions} />
          <StatCard label="Plays" value={bundle.totals.plays} />
          <StatCard label="Bars getrackt" value={bundle.totals.linesTracked} />
        </div>

        {/* Charts */}
        <div
          className={cn(
            "grid grid-cols-1 gap-3 transition-opacity duration-200 lg:grid-cols-2",
            loading && "opacity-60",
          )}
        >
          <Card>
            <CardHeader>
              <CardTitle>Schwierigkeitsverteilung</CardTitle>
              <CardDescription>Bars nach gelöster Rate (Artist + Cloze + Daily)</CardDescription>
            </CardHeader>
            <CardContent>
              <DifficultyHistogram buckets={bundle.histogram} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Plays über Zeit</CardTitle>
              <CardDescription>Gespielte Runden pro Tag</CardDescription>
            </CardHeader>
            <CardContent>
              <PlaysOverTime points={bundle.playsByDay} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Top Artists</CardTitle>
                <CardDescription>
                  {topMetric === "pull"
                    ? "Sessions, die diesen Artist aktiv gewählt haben"
                    : "Wiedererkennungsrate (Artist richtig getippt)"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-border/50 bg-background/40 p-1">
                {(["pull", "recognition"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTopMetric(m)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold transition outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/50",
                      topMetric === m
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "pull" ? "Pull" : "Recognition"}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <TopArtistsBar data={topArtists} onSelect={(id) => setArtistDrawer(id)} />
            </CardContent>
          </Card>
        </div>

        {/* View toggle + search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full border border-border/50 bg-card/40 p-1">
            {(["lines", "artists"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold transition outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/50",
                  view === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "lines" ? "Lines" : "Artists"}
              </button>
            ))}
          </div>
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === "lines" ? "Line oder Artist suchen…" : "Artist suchen…"}
            aria-label={view === "lines" ? "Lines durchsuchen" : "Artists durchsuchen"}
            className="w-full max-w-xs"
          />
        </div>

        <div className={cn("transition-opacity duration-200", loading && "opacity-60")}>
          {view === "lines" ? (
            <LinesTable lines={bundle.lines} search={search} onPick={(id) => setLineDrawer(id)} />
          ) : (
            <ArtistsTable
              artists={bundle.artists}
              search={search}
              onPick={(id) => setArtistDrawer(id)}
            />
          )}
        </div>
      </div>

      {lineDrawer !== null && (
        <LineDetailDrawer punchlineId={lineDrawer} range={range} onClose={() => setLineDrawer(null)} />
      )}
      {artistDrawer !== null && (
        <ArtistDetailDrawer
          artistId={artistDrawer}
          range={range}
          onClose={() => setArtistDrawer(null)}
          onPickLine={(pid) => {
            setArtistDrawer(null)
            setLineDrawer(pid)
          }}
        />
      )}
    </AdminShell>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {label}
        </span>
        <span className="text-2xl font-extrabold tabular-nums">{value.toLocaleString("de-DE")}</span>
      </CardContent>
    </Card>
  )
}

// ─── Lines table ──────────────────────────────────────────────────────────────

type LineSortKey = "served" | "artist" | "cloze" | "song" | "skip" | "abandon" | "overall"

function LinesTable({
  lines,
  search,
  onPick,
}: {
  lines: Array<LineRow>
  search: string
  onPick: (id: number) => void
}) {
  const { sort, onSort } = useSort<LineSortKey>("served")
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q
      ? lines.filter(
          (l) => l.line.toLowerCase().includes(q) || l.artistName.toLowerCase().includes(q),
        )
      : lines
    const val = (l: LineRow): number | null => {
      switch (sort.key) {
        case "served":
          return l.served
        case "artist":
          return l.artist.rate
        case "cloze":
          return l.cloze.rate
        case "song":
          return l.song.rate
        case "skip":
          return l.song.skipRate
        case "abandon":
          return l.abandonRate
        case "overall":
          return l.overallRate
      }
    }
    return [...base].sort((a, b) => cmp(val(a), val(b), sort.dir))
  }, [lines, search, sort])

  return (
    <div className="rounded-2xl border border-border/40 bg-card/30">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[260px]">Line</TableHead>
            <SortHead label="Gezeigt" sortKey="served" sort={sort} onSort={onSort} />
            <SortHead label="Gesamt" sortKey="overall" sort={sort} onSort={onSort} />
            <SortHead label="Artist" sortKey="artist" sort={sort} onSort={onSort} />
            <SortHead label="Cloze" sortKey="cloze" sort={sort} onSort={onSort} />
            <SortHead label="Song" sortKey="song" sort={sort} onSort={onSort} />
            <SortHead label="Skip" sortKey="skip" sort={sort} onSort={onSort} />
            <SortHead label="Abbruch" sortKey="abandon" sort={sort} onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((l) => (
            <TableRow
              key={l.punchlineId}
              className="cursor-pointer outline-none transition-colors active:bg-muted/50 focus-visible:bg-muted/50"
              aria-label={`${l.artistName}: ${l.line}`}
              {...activate(() => onPick(l.punchlineId))}
            >
              <TableCell className="max-w-[360px] whitespace-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug">
                    {l.line}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-primary/90">{l.artistName}</span>
                    <span className="opacity-60"> · {l.songTitle}</span>
                    {!l.active && <span className="opacity-50"> · inaktiv</span>}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm font-bold tabular-nums">{l.served}</span>
                <span className="block text-[10px] tabular-nums text-muted-foreground/60">
                  {l.distinctPlayers} Spieler
                </span>
              </TableCell>
              <TableCell>
                <RateCell rate={l.overallRate} correct={0} plays={l.overallPlays} />
              </TableCell>
              <TableCell>
                <RateCell rate={l.artist.rate} correct={l.artist.correct} plays={l.artist.plays} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col leading-tight">
                  <RateCell rate={l.cloze.rate} correct={l.cloze.correct} plays={l.cloze.plays} />
                  {l.cloze.avgTries !== null && (
                    <span className="text-[10px] tabular-nums text-muted-foreground/50">
                      ⌀ {l.cloze.avgTries.toFixed(1)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <RateCell rate={l.song.rate} correct={l.song.correct} plays={l.song.plays} />
              </TableCell>
              <TableCell>
                <RateCell rate={l.song.skipRate} correct={l.song.skips} plays={l.song.plays + l.song.skips} />
              </TableCell>
              <TableCell>
                <RateCell rate={l.abandonRate} correct={l.abandoned} plays={l.served} />
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                Keine Lines.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ─── Artists table ──────────────────────────────────────────────────────────────

type ArtistSortKey = "served" | "players" | "recognition" | "pull" | "restarts" | "fools" | "lines"

function ArtistsTable({
  artists,
  search,
  onPick,
}: {
  artists: Array<ArtistRow>
  search: string
  onPick: (id: number) => void
}) {
  const { sort, onSort } = useSort<ArtistSortKey>("served")
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q ? artists.filter((a) => a.artistName.toLowerCase().includes(q)) : artists
    const val = (a: ArtistRow): number | null => {
      switch (sort.key) {
        case "served":
          return a.served
        case "players":
          return a.distinctPlayers
        case "recognition":
          return a.recognition.rate
        case "pull":
          return a.pullSessions
        case "restarts":
          return a.pullRestarts
        case "fools":
          return a.foolsAsDistractor
        case "lines":
          return a.lineCount
      }
    }
    return [...base].sort((a, b) => cmp(val(a), val(b), sort.dir))
  }, [artists, search, sort])

  return (
    <div className="rounded-2xl border border-border/40 bg-card/30">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Artist</TableHead>
            <SortHead label="Bars" sortKey="lines" sort={sort} onSort={onSort} />
            <SortHead label="Gezeigt" sortKey="served" sort={sort} onSort={onSort} />
            <SortHead label="Spieler" sortKey="players" sort={sort} onSort={onSort} />
            <SortHead label="Recognition" sortKey="recognition" sort={sort} onSort={onSort} />
            <SortHead label="Pull" sortKey="pull" sort={sort} onSort={onSort} />
            <SortHead label="Restarts" sortKey="restarts" sort={sort} onSort={onSort} />
            <SortHead label="Fools" sortKey="fools" sort={sort} onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((a) => (
            <TableRow
              key={a.artistId}
              className="cursor-pointer outline-none transition-colors active:bg-muted/50 focus-visible:bg-muted/50"
              aria-label={a.artistName}
              {...activate(() => onPick(a.artistId))}
            >
              <TableCell>
                <span className="text-[13px] font-semibold">{a.artistName}</span>
                {a.confusedWith[0] && (
                  <span className="block text-[10px] text-muted-foreground/60">
                    ↔ {a.confusedWith[0].artistName}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-sm font-medium tabular-nums text-muted-foreground">
                {a.lineCount}
              </TableCell>
              <TableCell className="text-sm font-bold tabular-nums">{a.served}</TableCell>
              <TableCell className="text-sm font-medium tabular-nums text-muted-foreground">
                {a.distinctPlayers}
              </TableCell>
              <TableCell>
                <RateCell
                  rate={a.recognition.rate}
                  correct={a.recognition.correct}
                  plays={a.recognition.plays}
                />
              </TableCell>
              <TableCell>
                {a.pullSessions > 0 ? (
                  <Badge variant="default">{a.pullSessions}</Badge>
                ) : (
                  <span className="text-sm tabular-nums text-muted-foreground/40">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm font-medium tabular-nums text-muted-foreground">
                {a.pullRestarts}
              </TableCell>
              <TableCell className="text-sm font-medium tabular-nums text-muted-foreground">
                {a.foolsAsDistractor}
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                Keine Artists.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
