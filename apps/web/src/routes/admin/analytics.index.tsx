import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { AdminShell } from "../../components/admin-shell"
import {
  ConversionTrend,
  SessionsTrend,
  SourceBars,
} from "../../components/conversion-charts"
import { getConversionMetricsFn } from "../../lib/conversion"
import type { ConversionMetrics, DateRange, FunnelStage } from "../../lib/conversion"

export const Route = createFileRoute("/admin/analytics/")({
  component: ConversionPage,
  loader: async () => getConversionMetricsFn({ data: { from: null, to: null } }),
})

// ─── Date presets ─────────────────────────────────────────────────────────────

type PresetKey = "all" | "7d" | "today"

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function rangeFor(preset: PresetKey): DateRange {
  if (preset === "all") return { from: null, to: null }
  const today = new Date().toISOString().slice(0, 10)
  return { from: preset === "today" ? today : isoDaysAgo(6), to: today }
}

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "7d", label: "7 days" },
  { key: "today", label: "Today" },
]

// ─── Formatting ───────────────────────────────────────────────────────────────

const pct1 = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`)
const num = (n: number) => n.toLocaleString("en-US")

// ─── Page ───────────────────────────────────────────────────────────────────────

function ConversionPage() {
  const initial = Route.useLoaderData()
  const [m, setM] = useState<ConversionMetrics>(initial)
  const [preset, setPreset] = useState<PresetKey>("all")
  const [loading, setLoading] = useState(false)

  const range = useMemo(() => rangeFor(preset), [preset])

  useEffect(() => {
    if (preset === "all" && m === initial) return
    let cancelled = false
    setLoading(true)
    getConversionMetricsFn({ data: range })
      .then((next) => !cancelled && setM(next))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  return (
    <AdminShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Conversion</h1>
            <p className="text-sm text-muted-foreground">
              Signup, share &amp; referral funnels from the launch.{" "}
              {loading && <span className="text-primary">refreshing…</span>}
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
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </header>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Sessions" value={num(m.sessions)} sub={`${num(m.completed)} completed`} />
          <Stat
            label="Signup rate"
            value={pct1(m.rates.signupRate)}
            sub={`${num(m.signups)} signups`}
            highlight
          />
          <Stat
            label="Shown → clicked"
            value={pct1(m.rates.shownToClicked)}
            sub={`${num(m.clicked)}/${num(m.shown)}`}
          />
          <Stat
            label="Share rate"
            value={pct1(m.rates.shareRate)}
            sub={`${num(m.shareCompleted)} completed`}
            highlight
          />
          <Stat
            label="Engagement"
            value={m.avgRounds ? m.avgRounds.toFixed(1) : "—"}
            sub={`${pct1(m.rates.pct5plus)} reach 5+`}
          />
          <Stat
            label="Render fail"
            value={pct1(m.rates.renderFailRate)}
            sub={`${num(m.renderFail)}/${num(m.renderOk + m.renderFail)}`}
            danger={(m.renderFail ?? 0) > 0}
          />
        </div>

        {/* Funnels */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Signup funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <Funnel stages={m.signupFunnel} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Share funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <Funnel stages={m.shareFunnel} />
              <p className="mt-3 text-xs text-muted-foreground">
                {num(m.shareDismissed)} share sheets dismissed · {num(m.refLandings)} referral
                landings
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Trends */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessions / hour</CardTitle>
            </CardHeader>
            <CardContent>
              <SessionsTrend points={m.timeseries} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Signups &amp; shares / hour</CardTitle>
            </CardHeader>
            <CardContent>
              <ConversionTrend points={m.timeseries} />
            </CardContent>
          </Card>
        </div>

        {/* Acquisition source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acquisition source — sessions &amp; signup rate</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <SourceBars data={m.bySource} />
            <div className="flex flex-col gap-1.5">
              {m.bySource.slice(0, 8).map((s) => (
                <div
                  key={s.source}
                  className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm odd:bg-white/[0.02]"
                >
                  <span className="font-semibold">{s.source}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {num(s.sessions)} ·{" "}
                    <span className="font-bold text-primary">{pct1(s.signupRate)}</span>
                  </span>
                </div>
              ))}
              {m.bySource.length === 0 && (
                <span className="text-xs text-muted-foreground/60">No source data yet</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  highlight,
  danger,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
  danger?: boolean
}) {
  return (
    <Card className="gap-0 p-4">
      <span className="text-[11px] font-bold tracking-wide text-muted-foreground/70 uppercase">
        {label}
      </span>
      <span
        className={cn(
          "mt-1 text-2xl font-extrabold tabular-nums tracking-tight",
          danger ? "text-destructive" : highlight ? "text-primary" : "text-foreground"
        )}
      >
        {value}
      </span>
      {sub && <span className="mt-0.5 text-xs text-muted-foreground/70">{sub}</span>}
    </Card>
  )
}

/** Funnel as proportional bars — width relative to the first (top) stage; each
 *  step shows its step-over-previous conversion. */
function Funnel({ stages }: { stages: Array<FunnelStage> }) {
  const top = stages[0]?.count ?? 0
  return (
    <div className="flex flex-col gap-2">
      {stages.map((s, i) => {
        const width = top > 0 ? Math.max((s.count / top) * 100, 2) : 0
        const prev = stages[i - 1]?.count
        const step = i > 0 && prev && prev > 0 ? s.count / prev : null
        return (
          <div key={s.key} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-foreground">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {num(s.count)}
                {step !== null && (
                  <span className="ml-2 font-bold text-primary">{pct1(step)}</span>
                )}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${width}%`, opacity: 0.5 + (i === 0 ? 0.5 : (s.count / top) * 0.5) }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
