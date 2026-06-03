import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { DayPoint, HistogramBucket } from "../lib/analytics"

/**
 * Charts for the admin analytics dashboard. Themed strictly to the single gold
 * accent (`--primary`) over neutral chart tokens — no second accent, per the
 * design system. recharts handles layout; we own every color + the motion.
 */

const GOLD = "var(--primary)"
const GRID = "color-mix(in oklch, var(--border) 60%, transparent)"
const AXIS = "var(--muted-foreground)"
const ANIM = 360

const axisTick = { fill: AXIS, fontSize: 11, fontWeight: 600 }

function TooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      {children}
    </div>
  )
}

// ─── Difficulty distribution ────────────────────────────────────────────────

export function DifficultyHistogram({ buckets }: { buckets: Array<HistogramBucket> }) {
  const data = buckets.map((b) => ({
    label: `${Math.round(b.from * 100)}`,
    range: `${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%`,
    count: b.count,
    // Hard lines (low correct-rate) glow brighter; easy lines recede.
    intensity: 1 - b.from,
  }))
  const total = buckets.reduce((s, b) => s + b.count, 0)
  if (total === 0) return <ChartEmpty label="Noch keine Daten" />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
        <XAxis
          dataKey="label"
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => `${v}%`}
          interval={1}
        />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
        <Tooltip
          cursor={{ fill: "color-mix(in oklch, var(--primary) 10%, transparent)" }}
          content={({ active, payload }) => {
            if (!active || !payload.length) return null
            const p = payload[0].payload as (typeof data)[number]
            return (
              <TooltipBox>
                <div className="font-semibold text-foreground">{p.count} Bars</div>
                <div className="text-muted-foreground">{p.range} richtig gelöst</div>
              </TooltipBox>
            )
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} animationDuration={ANIM} animationEasing="ease-out">
          {data.map((d, i) => (
            <Cell key={i} fill={GOLD} fillOpacity={0.25 + d.intensity * 0.6} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Plays over time ──────────────────────────────────────────────────────────

export function PlaysOverTime({ points }: { points: Array<DayPoint> }) {
  if (points.length === 0) return <ChartEmpty label="Noch keine Plays" />
  const data = points.map((p) => ({ ...p, short: p.date.slice(5) }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
        <defs>
          <linearGradient id="playsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
        <XAxis dataKey="short" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
        <Tooltip
          cursor={{ stroke: GOLD, strokeOpacity: 0.4 }}
          content={({ active, payload }) => {
            if (!active || !payload.length) return null
            const p = payload[0].payload as (typeof data)[number]
            return (
              <TooltipBox>
                <div className="font-semibold text-foreground">{p.plays} Plays</div>
                <div className="text-muted-foreground">{p.date}</div>
              </TooltipBox>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="plays"
          stroke={GOLD}
          strokeWidth={2}
          fill="url(#playsFill)"
          animationDuration={ANIM}
          animationEasing="ease-out"
          dot={false}
          activeDot={{ r: 3, fill: GOLD }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Top artists (horizontal bars) ─────────────────────────────────────────────

export type TopArtistDatum = { artistId: number; name: string; value: number; suffix?: string }

export function TopArtistsBar({
  data,
  onSelect,
}: {
  data: Array<TopArtistDatum>
  onSelect?: (artistId: number) => void
}) {
  if (data.length === 0) return <ChartEmpty label="Noch keine Daten" />
  const height = Math.max(140, data.length * 34 + 16)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 4, left: 8 }}
        barCategoryGap={8}
      >
        <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="2 4" />
        <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ ...axisTick, fill: "var(--foreground)" }}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip
          cursor={{ fill: "color-mix(in oklch, var(--primary) 10%, transparent)" }}
          content={({ active, payload }) => {
            if (!active || !payload.length) return null
            const p = payload[0].payload as TopArtistDatum
            return (
              <TooltipBox>
                <div className="font-semibold text-foreground">{p.name}</div>
                <div className="text-muted-foreground">
                  {p.value}
                  {p.suffix ?? ""}
                </div>
              </TooltipBox>
            )
          }}
        />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          animationDuration={ANIM}
          animationEasing="ease-out"
          cursor={onSelect ? "pointer" : undefined}
          onClick={(d: { payload?: TopArtistDatum }) => d.payload && onSelect?.(d.payload.artistId)}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={GOLD} fillOpacity={0.85 - (i / data.length) * 0.5} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground/60">
      {label}
    </div>
  )
}
