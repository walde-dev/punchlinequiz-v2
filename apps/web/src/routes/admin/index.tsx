import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { isAdminFn } from "../../lib/session"
import type { ArtistRow, BarRow } from "../../lib/admin-client"
import { fetchArtists, fetchBars, createBar, patchBar } from "../../lib/admin-client"
import { EditBarDrawer } from "../../components/edit-bar-drawer"

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
  beforeLoad: async () => {
    const { admin } = await isAdminFn()
    if (!admin) {
      throw redirect({ to: "/admin/login" })
    }
  },
})

function AdminDashboard() {
  const navigate = useNavigate()
  const [bars, setBars] = useState<BarRow[]>([])
  const [artists, setArtists] = useState<ArtistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setErr(null)
    try {
      const [b, a] = await Promise.all([
        fetchBars({ search, includeInactive }),
        fetchArtists(),
      ])
      setBars(b.items)
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
  }, [includeInactive])

  async function onLogout() {
    await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" })
    await navigate({ to: "/admin/login" })
  }

  const editingBar = editingId != null ? bars.find((b) => b.id === editingId) ?? null : null

  return (
    <div className="relative min-h-svh">
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border/40 bg-background/95 px-5 py-3 md:bg-background/80 md:backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link to="/" className="select-none text-base font-bold tracking-tight">
            <span className="text-foreground">punchline</span>
            <span className="text-primary">/quiz</span>
          </Link>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            admin
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/play"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            → spielen
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-xs font-semibold"
          >
            Logout
          </Button>
        </div>
      </header>

      <main className="relative mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Bars</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? "Lädt…" : `${bars.length} Treffer`}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="font-bold"
          >
            {showCreate ? "Abbrechen" : "+ Neue Bar"}
          </Button>
        </div>

        {showCreate && (
          <CreateBarForm
            artists={artists}
            onCreated={async () => {
              setShowCreate(false)
              await refresh()
            }}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") refresh()
            }}
            placeholder="Suche Line / Artist / Song …"
            className="flex-1 min-w-[200px] rounded-full border border-border/60 bg-card/60 px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-primary"
            />
            inaktive zeigen
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={refresh}>
            Suchen
          </Button>
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <ul className="flex flex-col divide-y divide-border/40 rounded-2xl border border-border/40 bg-card/40">
          {bars.map((b) => (
            <li
              key={b.id}
              className={cn(
                "flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-card/80",
                !b.active && "opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold leading-snug text-foreground">{b.line}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground/80">{b.artistName}</span>
                    <span className="opacity-60"> · {b.songTitle}</span>
                    {b.releaseYear && <span className="opacity-50"> · {b.releaseYear}</span>}
                    <span className="opacity-40"> · #{b.id}</span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(b.id)}
                  className="shrink-0 text-xs font-semibold"
                >
                  Bearbeiten
                </Button>
              </div>
            </li>
          ))}
          {!loading && bars.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              Keine Bars gefunden.
            </li>
          )}
        </ul>
      </main>

      {editingBar && (
        <EditBarDrawer
          bar={editingBar}
          artists={artists}
          onClose={() => setEditingId(null)}
          onSaved={async () => {
            setEditingId(null)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function CreateBarForm({
  artists,
  onCreated,
}: {
  artists: ArtistRow[]
  onCreated: () => Promise<void>
}) {
  const [artist, setArtist] = useState("")
  const [song, setSong] = useState("")
  const [line, setLine] = useState("")
  const [d1, setD1] = useState("")
  const [d2, setD2] = useState("")
  const [album, setAlbum] = useState("")
  const [year, setYear] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await createBar({
        artist: artist.trim(),
        song: song.trim(),
        line: line.trim(),
        distractor1: d1.trim(),
        distractor2: d2.trim(),
        album: album.trim() || undefined,
        releaseYear: year.trim() ? Number(year.trim()) : undefined,
      })
      setArtist("")
      setSong("")
      setLine("")
      setD1("")
      setD2("")
      setAlbum("")
      setYear("")
      await onCreated()
    } catch (e2) {
      setErr(String(e2))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/60"
  const labelCls = "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={labelCls}>
          Artist (korrekt)
          <ArtistInput value={artist} onChange={setArtist} artists={artists} />
        </label>
        <label className={labelCls}>
          Song
          <input
            value={song}
            onChange={(e) => setSong(e.target.value)}
            required
            className={inputCls}
          />
        </label>
      </div>
      <label className={labelCls}>
        Bar (Line)
        <textarea
          value={line}
          onChange={(e) => setLine(e.target.value)}
          required
          rows={2}
          className={cn(inputCls, "resize-none font-semibold")}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={labelCls}>
          Distractor 1
          <ArtistInput value={d1} onChange={setD1} artists={artists} />
        </label>
        <label className={labelCls}>
          Distractor 2
          <ArtistInput value={d2} onChange={setD2} artists={artists} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={labelCls}>
          Album (optional)
          <input value={album} onChange={(e) => setAlbum(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          Jahr (optional)
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            className={inputCls}
          />
        </label>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className="font-bold">
          {busy ? "…" : "Bar erstellen"}
        </Button>
      </div>
    </form>
  )
}

function ArtistInput({
  value,
  onChange,
  artists,
}: {
  value: string
  onChange: (v: string) => void
  artists: ArtistRow[]
}) {
  const listId = `artists-${Math.random().toString(36).slice(2, 8)}`
  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/60"
      />
      <datalist id={listId}>
        {artists.map((a) => (
          <option key={a.id} value={a.name} />
        ))}
      </datalist>
    </>
  )
}

export { patchBar }
