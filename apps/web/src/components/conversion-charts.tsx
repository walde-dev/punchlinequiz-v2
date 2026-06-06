import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { SourceRow, TsPoint } from "../lib/conversion"

/**
 * Charts for the conversion dashboard (PUN-118/119/121/122). Single gold accent
 * over neutral tokens, matching analytics-charts.tsx — no second accent.
 */

const GOLD = "var(--primary)"
const GOLD_DIM = "color-mix(in oklch, var(--primary) 45%, transparent)"
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

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground/60">
      {label}
    </div>
  )
}

/** Hour label from an ISO-ish "YYYY-MM-DDTHH:00" bucket. */
function hourLabel(bucket: string): string {
  const [d, h] = bucket.split("T")
  return `${d.slice(5)} ${h?.slice(0, 2) ?? ""}h`
}

// ─── Sessions over time (volume context) ────────────────────────────────────

export function SessionsTrend({ points }: { points: Array<TsPoint> }) {
  if (points.length === 0) return <ChartEmpty label="No sessions yet" />
  const data = points.map((p) => ({ ...p, label: hourLabel(p.bucket) }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
        <defs>
          <linearGradient id="sessFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
        <Tooltip
          cursor={{ stroke: GOLD, strokeOpacity: 0.4 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as (typeof data)[number]
            return (
              <TooltipBox>
                <div className="font-semibold text-foreground">{p.sessions} sessions</div>
                <div className="text-muted-foreground">{p.label}</div>
              </TooltipBox>
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="sessions"
          stroke={GOLD}
          strokeWidth={2}
          fill="url(#sessFill)"
          animationDuration={ANIM}
          dot={false}
          activeDot={{ r: 3, fill: GOLD }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Conversions over time (signups + shares) ───────────────────────────────

export function ConversionTrend({ points }: { points: Array<TsPoint> }) {
  if (points.length === 0) return <ChartEmpty label="No conversions yet" />
  const data = points.map((p) => ({ ...p, label: hourLabel(p.bucket) }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
        <Tooltip
          cursor={{ fill: "color-mix(in oklch, var(--primary) 10%, transparent)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as (typeof data)[number]
            return (
              <TooltipBox>
                <div className="font-semibold text-foreground">{p.label}</div>
                <div className="text-primary">{p.signups} signups</div>
                <div className="text-muted-foreground">{p.shares} share taps</div>
              </TooltipBox>
            )
          }}
        />
        <Legend
          verticalAlign="top"
          height={24}
          iconType="circle"
          wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
        />
        <Bar dataKey="signups" name="Signups" fill={GOLD} radius={[3, 3, 0, 0]} animationDuration={ANIM} />
        <Bar dataKey="shares" name="Share taps" fill={GOLD_DIM} radius={[3, 3, 0, 0]} animationDuration={ANIM} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Sessions by acquisition source ─────────────────────────────────────────

export function SourceBars({ data }: { data: Array<SourceRow> }) {
  if (data.length === 0) return <ChartEmpty label="No source data yet" />
  const rows = data.slice(0, 8)
  const height = Math.max(140, rows.length * 34 + 24)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="2 4" />
        <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="source"
          tick={{ ...axisTick, fill: "var(--foreground)" }}
          tickLine={false}
          axisLine={false}
          width={88}
        />
        <Tooltip
          cursor={{ fill: "color-mix(in oklch, var(--primary) 10%, transparent)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as SourceRow
            const pct = p.signupRate === null ? "–" : `${(p.signupRate * 100).toFixed(1)}%`
            return (
              <TooltipBox>
                <div className="font-semibold text-foreground">{p.source}</div>
                <div className="text-muted-foreground">{p.sessions} sessions</div>
                <div className="text-primary">{p.signups} signups · {pct}</div>
              </TooltipBox>
            )
          }}
        />
        <Bar dataKey="sessions" radius={[0, 4, 4, 0]} animationDuration={ANIM}>
          {rows.map((_, i) => (
            <Cell key={i} fill={GOLD} fillOpacity={0.85 - (i / rows.length) * 0.5} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
