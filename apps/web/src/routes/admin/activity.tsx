import { createFileRoute, redirect } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { AdminShell } from "../../components/admin-shell"
import { isAdminFn } from "../../lib/session"
import { getActivityLog } from "../../lib/activity-log"
import { CATEGORIES, CATEGORY_GLYPH, categoryFor, describeEvent } from "../../lib/activity-events"
import type { ActivityActor, ActivityItem, ActivityPage } from "../../lib/activity-log"
import type { CategoryKey } from "../../lib/activity-events"

export const Route = createFileRoute("/admin/activity")({
  component: ActivityPage,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) throw redirect({ to: "/admin/login" })
  },
  loader: async () => getActivityLog({ data: { limit: 50 } }),
})

// ─── Date presets ───────────────────────────────────────────────────────────────

type PresetKey = "all" | "today" | "7d" | "30d"

function localDayKey(d: Date): string {
  return d.toLocaleDateString("sv-SE") // YYYY-MM-DD, local tz
}
function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return localDayKey(d)
}
function rangeFor(preset: PresetKey): { from: string | null; to: string | null } {
  switch (preset) {
    case "all":
      return { from: null, to: null }
    case "today":
      return { from: localDayKey(new Date()), to: localDayKey(new Date()) }
    case "7d":
      return { from: isoDaysAgo(6), to: null }
    case "30d":
      return { from: isoDaysAgo(29), to: null }
  }
}
const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: "all", label: "Gesamt" },
  { key: "30d", label: "30 Tage" },
  { key: "7d", label: "7 Tage" },
  { key: "today", label: "Heute" },
]

// ─── Time + actor formatting ──────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const min = 60_000
  const hr = 60 * min
  const day = 24 * hr
  if (diff < min) return "gerade eben"
  if (diff < hr) return `vor ${Math.floor(diff / min)} Min`
  if (diff < day) return `vor ${Math.floor(diff / hr)} Std`
  const days = Math.floor(diff / day)
  if (days < 7) return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" })
}

function dayLabel(iso: string): string {
  const key = localDayKey(new Date(iso))
  const today = localDayKey(new Date())
  const yesterday = isoDaysAgo(1)
  if (key === today) return "Heute"
  if (key === yesterday) return "Gestern"
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function actorName(actor: ActivityActor): string {
  switch (actor.kind) {
    case "clerk":
      return actor.handle ? `@${actor.handle}` : actor.email ?? `User ${actor.userId.slice(5, 11)}`
    case "anon":
      return `Anon ${actor.sessionShort}`
    case "token":
      return "CLI"
    case "system":
      return "System"
  }
}

function initials(name: string): string {
  const clean = name.replace(/^@/, "")
  return clean.slice(0, 2).toUpperCase()
}

// ─── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ actor, name, category }: { actor: ActivityActor; name: string; category: CategoryKey }) {
  const base =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1"
  if (actor.kind === "clerk" && actor.imageUrl) {
    return (
      <img
        src={actor.imageUrl}
        alt=""
        className={cn(base, "object-cover ring-border/60")}
        loading="lazy"
      />
    )
  }
  if (actor.kind === "clerk") {
    return <span className={cn(base, "bg-primary/15 text-primary ring-primary/30")}>{initials(name)}</span>
  }
  // anon / system / cli → category glyph so the row still reads at a glance.
  return (
    <span
      className={cn(base, "bg-muted/50 text-muted-foreground/80 ring-border/50")}
      aria-hidden="true"
    >
      {CATEGORY_GLYPH[category]}
    </span>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

function ActivityPage() {
  const initial = Route.useLoaderData()
  const [items, setItems] = useState<Array<ActivityItem>>(initial.items)
  const [nextCursor, setNextCursor] = useState<number | null>(initial.nextCursor)
  const [category, setCategory] = useState<CategoryKey | null>(null)
  const [preset, setPreset] = useState<PresetKey>("all")
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("") // debounced
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const reqId = useRef(0)

  // Debounce the free-text search so we don't refetch on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const range = useMemo(() => rangeFor(preset), [preset])

  const fetchPage = useCallback(
    (cursor: number | null): Promise<ActivityPage> =>
      getActivityLog({
        data: { category, q: q || null, from: range.from, to: range.to, cursor, limit: 50 },
      }),
    [category, q, range.from, range.to],
  )

  // Reload from the top whenever a filter changes (skip the very first render —
  // the loader already gave us the unfiltered first page).
  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    const myReq = ++reqId.current
    setLoading(true)
    fetchPage(null)
      .then((page) => {
        if (myReq !== reqId.current) return
        setItems(page.items)
        setNextCursor(page.nextCursor)
      })
      .finally(() => {
        if (myReq === reqId.current) setLoading(false)
      })
  }, [fetchPage])

  const refresh = useCallback(() => {
    const myReq = ++reqId.current
    setLoading(true)
    fetchPage(null)
      .then((page) => {
        if (myReq !== reqId.current) return
        setItems(page.items)
        setNextCursor(page.nextCursor)
      })
      .finally(() => {
        if (myReq === reqId.current) setLoading(false)
      })
  }, [fetchPage])

  const loadMore = useCallback(() => {
    if (nextCursor === null) return
    setLoadingMore(true)
    fetchPage(nextCursor)
      .then((page) => {
        setItems((prev) => [...prev, ...page.items])
        setNextCursor(page.nextCursor)
      })
      .finally(() => setLoadingMore(false))
  }, [fetchPage, nextCursor])

  // Group consecutive items by calendar day for the section headers.
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: Array<ActivityItem> }> = []
    for (const it of items) {
      const label = dayLabel(it.createdAt)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(it)
      else out.push({ label, items: [it] })
    }
    return out
  }, [items])

  return (
    <AdminShell>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Aktivität</h1>
            <p className="text-sm text-muted-foreground">
              Jede Aktion aus dem Event-Log — neueste zuerst.{" "}
              {loading && <span className="text-primary">aktualisiere…</span>}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <span className={cn("mr-1.5 inline-block", loading && "animate-spin")} aria-hidden="true">
              ↻
            </span>
            Aktualisieren
          </Button>
        </header>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill active={category === null} onClick={() => setCategory(null)}>
              Alles
            </FilterPill>
            {CATEGORIES.map((c) => (
              <FilterPill key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
                <span className="mr-1 opacity-70" aria-hidden="true">
                  {c.glyph}
                </span>
                {c.label}
              </FilterPill>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Session, E-Mail oder Event suchen…"
              aria-label="Aktivität durchsuchen"
              className="w-full max-w-xs"
            />
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
          </div>
        </div>

        {/* Feed */}
        <div className={cn("transition-opacity duration-200", loading && "opacity-50")}>
          {groups.length === 0 ? (
            <div className="rounded-2xl border border-border/40 bg-card/30 py-16 text-center text-sm text-muted-foreground">
              Keine Aktivität für diesen Filter.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((g) => (
                <section key={g.label} className="flex flex-col gap-1">
                  <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
                    {g.label}
                  </h2>
                  <ol className="flex flex-col">
                    {g.items.map((it) => (
                      <ActivityRow key={it.id} item={it} />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </div>

        {nextCursor !== null && (
          <div className="flex justify-center pb-4">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "lädt…" : "Mehr laden"}
            </Button>
          </div>
        )}
      </div>
    </AdminShell>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border/50 bg-card/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  const [open, setOpen] = useState(false)
  const name = actorName(item.actor)
  const category = categoryFor(item.name)
  const predicate = describeEvent(item.name, item.props)
  const hasProps = item.props && Object.keys(item.props).length > 0

  return (
    <li className="group relative flex gap-3 pb-3 last:pb-0">
      {/* Connecting line between entries, like Linear's activity feed. */}
      <span
        className="absolute left-[13px] top-8 bottom-0 w-px bg-border/40 group-last:hidden"
        aria-hidden="true"
      />
      <Avatar actor={item.actor} name={name} category={category} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-start gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md"
        >
          <span className="text-sm leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">{name}</span> {predicate}
            <span className="text-muted-foreground/50"> · </span>
            <span className="text-muted-foreground/70" title={new Date(item.createdAt).toLocaleString("de-DE")}>
              {relTime(item.createdAt)}
            </span>
            <span className="ml-2 font-mono text-[10px] text-muted-foreground/35">{item.name}</span>
          </span>
        </button>
        {open && hasProps && (
          <pre className="mt-1.5 max-w-full overflow-x-auto rounded-lg border border-border/40 bg-background/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            {JSON.stringify(item.props, null, 2)}
          </pre>
        )}
      </div>
    </li>
  )
}
