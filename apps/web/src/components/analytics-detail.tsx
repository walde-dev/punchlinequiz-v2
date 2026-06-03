import { useEffect, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { getArtistDetail, getLineDetail } from "../lib/analytics"
import type {
  ArtistDetail,
  ClozeStat,
  DateRange,
  FunnelStage,
  LineDetail,
  ModeStat,
  SongStat,
} from "../lib/analytics"

const FUNNEL_LABELS: Record<string, string> = {
  served: "Gezeigt",
  answered: "Beantwortet",
  song_shown: "Song-Step",
  song_correct: "Song richtig",
}

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`
}

/** Gold flags the hard lines (the thing worth noticing); everything else neutral. */
function rateTone(rate: number | null): string {
  if (rate === null) return "text-muted-foreground/50"
  if (rate < 0.34) return "text-primary"
  return "text-foreground"
}

function StatBlock({
  label,
  stat,
  extra,
}: {
  label: string
  stat: ModeStat | ClozeStat | SongStat
  extra?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/30 px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <span className={cn("text-xl font-extrabold tabular-nums", rateTone(stat.rate))}>
        {pct(stat.rate)}
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {stat.correct}/{stat.plays}
        {extra ? ` · ${extra}` : ""}
      </span>
    </div>
  )
}

function FunnelBars({ stages }: { stages: Array<FunnelStage> }) {
  const top = stages[0]?.count ?? 0
  return (
    <div className="flex flex-col gap-2">
      {stages.map((s, i) => {
        const w = top > 0 ? (s.count / top) * 100 : 0
        const prev = i > 0 ? stages[i - 1].count : s.count
        const drop = prev > 0 ? Math.round((1 - s.count / prev) * 100) : 0
        return (
          <div key={s.key} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[11px] font-semibold text-muted-foreground">
              {FUNNEL_LABELS[s.key] ?? s.key}
            </span>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-background/40">
              <div
                className="h-full w-full origin-left rounded-md bg-primary/70 transition-transform duration-500 ease-out"
                style={{ transform: `scaleX(${w / 100})` }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-bold tabular-nums text-foreground">
                {s.count}
              </span>
            </div>
            {i > 0 && drop > 0 && (
              <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                −{drop}%
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DrawerShell({
  eyebrow,
  title,
  onClose,
  children,
}: {
  eyebrow: string
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${eyebrow}: ${title}`}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-t-2xl border border-border/60 bg-card p-5 md:rounded-2xl"
        // ease-out entrance (starts fast → feels responsive); never scale(0).
        style={{ animation: "pq-fade-up 260ms cubic-bezier(0.16,1,0.3,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </p>
            <h3 className="text-lg font-extrabold leading-snug tracking-tight">{title}</h3>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="shrink-0">
            Schließen
          </Button>
        </header>
        {children}
      </div>
    </div>
  )
}

// ─── Line detail ────────────────────────────────────────────────────────────

export function LineDetailDrawer({
  punchlineId,
  range,
  onClose,
}: {
  punchlineId: number
  range: DateRange
  onClose: () => void
}) {
  const [data, setData] = useState<LineDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getLineDetail({ data: { ...range, punchlineId } })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [punchlineId, range])

  return (
    <DrawerShell
      eyebrow={`Bar #${punchlineId}`}
      title={data?.artistName ?? "…"}
      onClose={onClose}
    >
      {loading || !data ? (
        <p className="text-sm text-muted-foreground">{loading ? "Lädt…" : "Keine Daten."}</p>
      ) : (
        <>
          <blockquote className="rounded-xl border border-border/40 bg-background/30 px-4 py-3 text-sm font-semibold leading-relaxed text-foreground">
            “{data.line}”
            <span className="mt-1 block text-[11px] font-medium text-muted-foreground">
              {data.songTitle}
              {data.clozePrompt ? " · Cloze verfügbar" : ""}
              {!data.active ? " · inaktiv" : ""}
            </span>
          </blockquote>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatBlock label="Artist" stat={data.artist} />
            <StatBlock
              label="Cloze"
              stat={data.cloze}
              extra={data.cloze.avgTries ? `${data.cloze.avgTries.toFixed(1)} Versuche` : undefined}
            />
            <StatBlock
              label="Song"
              stat={data.song}
              extra={`${data.song.skips} Skips`}
            />
            <StatBlock label="Daily" stat={data.daily} />
          </div>

          <section className="flex flex-col gap-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Trichter
            </h4>
            <FunnelBars stages={data.funnel} />
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Antwort-Verteilung (Artist-Modus)
            </h4>
            <div className="flex flex-col gap-1.5">
              {(() => {
                const total = data.distractors.reduce((s, d) => s + d.picks, 0)
                return data.distractors.map((d) => {
                  const w = total > 0 ? (d.picks / total) * 100 : 0
                  return (
                    <div key={d.artistId} className="flex items-center gap-3">
                      <span className="flex w-32 shrink-0 items-center gap-1.5 truncate text-[12px] font-semibold">
                        {d.isCorrectArtist && (
                          <span className="text-primary" aria-label="richtig">
                            ✓
                          </span>
                        )}
                        <span className="truncate">{d.artistName}</span>
                      </span>
                      <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-background/40">
                        <div
                          className={cn(
                            "h-full w-full origin-left rounded-md transition-transform duration-500 ease-out",
                            d.isCorrectArtist ? "bg-primary/70" : "bg-muted-foreground/30",
                          )}
                          style={{ transform: `scaleX(${w / 100})` }}
                        />
                        <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-bold tabular-nums">
                          {d.picks}
                        </span>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </section>
        </>
      )}
    </DrawerShell>
  )
}

// ─── Artist detail ──────────────────────────────────────────────────────────

export function ArtistDetailDrawer({
  artistId,
  range,
  onClose,
  onPickLine,
}: {
  artistId: number
  range: DateRange
  onClose: () => void
  onPickLine: (punchlineId: number) => void
}) {
  const [data, setData] = useState<ArtistDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getArtistDetail({ data: { ...range, artistId } })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [artistId, range])

  return (
    <DrawerShell eyebrow="Artist" title={data?.artistName ?? "…"} onClose={onClose}>
      {loading || !data ? (
        <p className="text-sm text-muted-foreground">{loading ? "Lädt…" : "Keine Daten."}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatBlock label="Wiedererkennung" stat={data.recognition} />
            <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/30 px-3 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Pull
              </span>
              <span className="text-xl font-extrabold tabular-nums text-foreground">
                {data.pullSessions}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {data.pullRestarts} Restarts
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/30 px-3 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Reichweite
              </span>
              <span className="text-xl font-extrabold tabular-nums text-foreground">
                {data.served}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {data.distinctPlayers} Spieler
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/30 px-3 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Verwechsler
              </span>
              <span className="text-xl font-extrabold tabular-nums text-foreground">
                {data.foolsAsDistractor}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">als Distraktor</span>
            </div>
          </div>

          {data.confusedWith.length > 0 && (
            <section className="flex flex-col gap-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Verwechselt mit
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {data.confusedWith.map((c) => (
                  <Badge key={c.artistId} variant="muted">
                    {c.artistName}
                    <span className="ml-1 font-mono text-[10px] text-primary/90">{c.count}×</span>
                  </Badge>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Bars ({data.lines.length})
            </h4>
            <ul className="flex flex-col divide-y divide-border/30 rounded-xl border border-border/40 bg-background/20">
              {data.lines.map((l) => (
                <li key={l.punchlineId}>
                  <button
                    type="button"
                    onClick={() => onPickLine(l.punchlineId)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/30"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{l.line}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {pct(l.overallRate)} · {l.served}×
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </DrawerShell>
  )
}
