import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { isAdminFn } from "../../lib/session"
import type { ArtistRow, ArtistTagRow, BarRow } from "../../lib/admin-client"
import {
  fetchArtists,
  fetchArtistTags,
  fetchBars,
  createArtist,
  createBar,
  getDeezerTrack,
  patchBar,
  searchDeezerArtists,
  searchDeezerTracks,
  setArtistTags,
} from "../../lib/admin-client"
import { Combobox, type ComboboxItem } from "../../components/combobox"
import { EditBarDrawer } from "../../components/edit-bar-drawer"
import { TagEditor, type SelectedTag } from "../../components/tag-editor"

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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [bars, setBars] = useState<BarRow[]>([])
  const [artists, setArtists] = useState<ArtistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateArtist, setShowCreateArtist] = useState(false)
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
  const artistName = (id: number) => artists.find((a) => a.id === id)?.name ?? `#${id}`

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
            {t("admin.badge")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/review"
            className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary hover:bg-primary/20"
          >
            {t("admin.dashboard.reviewStack")}
          </Link>
          <Link
            to="/admin/daily"
            className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary hover:bg-primary/20"
          >
            {t("admin.dashboard.daily")}
          </Link>
          <Link
            to="/play"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("admin.common.playLink")}
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="text-xs font-semibold"
          >
            {t("admin.common.logout")}
          </Button>
        </div>
      </header>

      <main className="relative mx-auto flex max-w-4xl flex-col gap-6 px-5 py-8 md:px-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t("admin.dashboard.barsTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? t("admin.common.loading") : t("admin.dashboard.hitsCount", { count: bars.length })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreateArtist((s) => !s)
                if (!showCreateArtist) setShowCreate(false)
              }}
              className="text-xs font-semibold"
            >
              {showCreateArtist ? t("admin.common.cancel") : t("admin.dashboard.newArtist")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowCreate((s) => !s)
                if (!showCreate) setShowCreateArtist(false)
              }}
              className="font-bold"
            >
              {showCreate ? t("admin.common.cancel") : t("admin.dashboard.newBar")}
            </Button>
          </div>
        </div>

        {showCreateArtist && (
          <CreateArtistForm
            onCreated={async () => {
              setShowCreateArtist(false)
              await refresh()
            }}
          />
        )}

        <ArtistTagsPanel artists={artists} />

        {showCreate && (
          <CreateBarForm
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
            placeholder={t("admin.dashboard.searchPlaceholder")}
            className="flex-1 min-w-[200px] rounded-full border border-border/60 bg-card/60 px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/60"
          />
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-primary"
            />
            {t("admin.dashboard.showInactive")}
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={refresh}>
            {t("admin.common.search")}
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
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-semibold leading-snug text-foreground">{b.line}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-primary">{b.artistName}</span>
                    <span className="opacity-60"> · {b.songTitle}</span>
                    {b.releaseYear && <span className="opacity-50"> · {b.releaseYear}</span>}
                    <span className="opacity-40"> · #{b.id}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                    <span className="text-muted-foreground/60">{t("admin.dashboard.vs")}</span>
                    <span className="rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-muted-foreground">
                      {artistName(b.distractor1Id)}
                    </span>
                    <span className="rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-muted-foreground">
                      {artistName(b.distractor2Id)}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(b.id)}
                  className="shrink-0 text-xs font-semibold"
                >
                  {t("admin.common.edit")}
                </Button>
              </div>
            </li>
          ))}
          {!loading && bars.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("admin.dashboard.noBars")}
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

function CreateBarForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { t } = useTranslation()
  const [artist, setArtist] = useState("")
  const [song, setSong] = useState("")
  const [line, setLine] = useState("")
  const [d1, setD1] = useState("")
  const [d2, setD2] = useState("")
  const [album, setAlbum] = useState("")
  const [year, setYear] = useState("")
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
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
      setCoverUrl(null)
      await onCreated()
    } catch (e2) {
      setErr(String(e2))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/60"
  const labelCls =
    "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={labelCls}>
          {t("admin.create.artistLabel")}
          <ArtistCombobox value={artist} onChange={setArtist} />
        </label>
        <label className={labelCls}>
          {t("admin.create.songLabel")}
          <TrackCombobox
            value={song}
            onChange={setSong}
            onPickTrack={async (t) => {
              setSong(t.title)
              if (t.albumTitle) setAlbum(t.albumTitle)
              if (t.releaseYear) setYear(String(t.releaseYear))
              if (!artist.trim() && t.artistName) setArtist(t.artistName)
              setCoverUrl(t.albumArtUrl)
              // /search hits don't include release_date — fetch /track/:id for the year.
              if (!t.releaseYear) {
                const full = await getDeezerTrack(t.trackId).catch(() => null)
                if (full?.releaseYear) setYear(String(full.releaseYear))
              }
            }}
          />
        </label>
      </div>
      <label className={labelCls}>
        {t("admin.create.barLabel")}
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
          {t("admin.create.distractor1")}
          <ArtistCombobox value={d1} onChange={setD1} />
        </label>
        <label className={labelCls}>
          {t("admin.create.distractor2")}
          <ArtistCombobox value={d2} onChange={setD2} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className={labelCls}>
          {t("admin.create.albumOptional")}
          <input value={album} onChange={(e) => setAlbum(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("admin.create.yearOptional")}
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            className={inputCls}
          />
        </label>
        {coverUrl && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("admin.create.cover")}
            </span>
            <img
              src={coverUrl}
              alt=""
              className="h-[42px] w-[42px] rounded-md border border-border/60 object-cover"
            />
          </div>
        )}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className="font-bold">
          {busy ? "…" : t("admin.create.createBar")}
        </Button>
      </div>
    </form>
  )
}

function CreateArtistForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<SelectedTag[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setErr(null)
    setInfo(null)
    try {
      const result = await createArtist(
        name.trim(),
        selectedTags.map((t) => ({ slug: t.slug, weight: t.weight })),
      )
      const tagCount = result.tagCount ?? selectedTags.length
      const tagPart =
        selectedTags.length > 0 ? t("admin.create.tagPart", { count: tagCount }) : ""
      setInfo(
        result.created
          ? t("admin.create.createdArtist", { name: result.name, id: result.id, tagPart })
          : t("admin.create.existsArtist", { name: result.name, id: result.id, tagPart }),
      )
      setName("")
      setPreviewUrl(null)
      setSelectedTags([])
      await onCreated()
    } catch (e2) {
      setErr(String(e2))
    } finally {
      setBusy(false)
    }
  }

  const labelCls =
    "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4"
    >
      <label className={labelCls}>
        {t("admin.create.deezerArtist")}
        <Combobox
          value={name}
          onChange={(v) => {
            setName(v)
            setPreviewUrl(null)
          }}
          onPick={(item) => {
            setName(item.label)
            setPreviewUrl(item.imageUrl ?? null)
          }}
          search={async (q): Promise<ComboboxItem[]> => {
            const hits = await searchDeezerArtists(q)
            return hits.map((a) => ({ key: a.id, label: a.name, imageUrl: a.imageUrl }))
          }}
          placeholder={t("admin.create.deezerSearchPlaceholder")}
          required
        />
      </label>

      <div className={labelCls}>
        {t("admin.create.tagsLabel")}
        <TagEditor
          value={selectedTags}
          onChange={setSelectedTags}
          hint={t("admin.create.tagsHint")}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-12 w-12 rounded-md border border-border/60 object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border/40 text-[10px] text-muted-foreground/60">
              {t("admin.create.noImage")}
            </span>
          )}
          <div className="flex flex-col">
            {err && <p className="text-xs text-destructive">{err}</p>}
            {info && <p className="text-xs text-primary">{info}</p>}
            {!err && !info && (
              <p className="text-xs text-muted-foreground/70">
                {t("admin.create.coverAuto")}
              </p>
            )}
          </div>
        </div>
        <Button type="submit" disabled={busy || !name.trim()} className="font-bold">
          {busy ? "…" : t("admin.create.createArtist")}
        </Button>
      </div>
    </form>
  )
}

function ArtistTagsPanel({ artists }: { artists: ArtistRow[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [tagsByArtist, setTagsByArtist] = useState<Record<number, ArtistTagRow[]>>({})
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [filter, setFilter] = useState("")
  const [showUntaggedOnly, setShowUntaggedOnly] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const entries = await Promise.all(
        artists.map(async (a) => {
          const r = await fetchArtistTags(a.id)
          return [a.id, r.items] as const
        }),
      )
      const map: Record<number, ArtistTagRow[]> = {}
      for (const [id, items] of entries) map[id] = items
      setTagsByArtist(map)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && artists.length > 0 && Object.keys(tagsByArtist).length === 0) {
      loadAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, artists.length])

  const editingArtist = editingId != null ? artists.find((a) => a.id === editingId) ?? null : null

  const visible = artists.filter((a) => {
    if (filter && !a.name.toLowerCase().includes(filter.toLowerCase())) return false
    if (showUntaggedOnly && (tagsByArtist[a.id]?.length ?? 0) > 0) return false
    return true
  })

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{t("admin.tags.panelTitle")}</h2>
          <p className="text-[11px] text-muted-foreground">
            {t("admin.tags.panelHint")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-semibold"
        >
          {open ? t("admin.common.close") : t("admin.tags.manage")}
        </Button>
      </div>

      {open && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("admin.tags.filterPlaceholder")}
              className="flex-1 min-w-[180px] rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring/60"
            />
            <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={showUntaggedOnly}
                onChange={(e) => setShowUntaggedOnly(e.target.checked)}
                className="accent-primary"
              />
              {t("admin.tags.untaggedOnly")}
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={loadAll} disabled={loading}>
              {loading ? "…" : t("admin.common.refresh")}
            </Button>
          </div>

          <ul className="flex max-h-[400px] flex-col divide-y divide-border/40 overflow-y-auto rounded-xl border border-border/40 bg-background/30">
            {visible.map((a) => {
              const tagList = tagsByArtist[a.id] ?? []
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground">{a.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {tagList.length === 0 ? (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                          {t("admin.tags.none")}
                        </span>
                      ) : (
                        tagList.map((t) => (
                          <span
                            key={t.slug}
                            className="rounded-full border border-border/40 bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {t.label}
                            <span className="ml-1 font-mono text-[9px] text-primary/80">
                              {t.weight.toFixed(2)}
                            </span>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-xs font-semibold"
                    onClick={() => setEditingId(a.id)}
                  >
                    {t("admin.common.edit")}
                  </Button>
                </li>
              )
            })}
            {!loading && visible.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                {t("admin.tags.noArtists")}
              </li>
            )}
          </ul>
        </>
      )}

      {editingArtist && (
        <ArtistTagsDrawer
          artist={editingArtist}
          initial={tagsByArtist[editingArtist.id] ?? null}
          onClose={() => setEditingId(null)}
          onSaved={(items) => {
            setTagsByArtist((m) => ({ ...m, [editingArtist.id]: items }))
            setEditingId(null)
          }}
        />
      )}
    </section>
  )
}

function ArtistTagsDrawer({
  artist,
  initial,
  onClose,
  onSaved,
}: {
  artist: ArtistRow
  initial: ArtistTagRow[] | null
  onClose: () => void
  onSaved: (items: ArtistTagRow[]) => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<SelectedTag[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function go() {
      const items = initial ?? (await fetchArtistTags(artist.id)).items
      if (cancelled) return
      setSelected(items.map((t) => ({ slug: t.slug, label: t.label, weight: t.weight })))
      setLoaded(true)
    }
    go()
    return () => {
      cancelled = true
    }
  }, [artist.id, initial])

  async function onSave() {
    setSaving(true)
    setErr(null)
    try {
      const r = await setArtistTags(
        artist.id,
        selected.map((t) => ({ slug: t.slug, weight: t.weight })),
      )
      onSaved(r.items)
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-t-2xl border border-border/60 bg-card p-5 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("admin.tags.drawerTagsFor")}
            </p>
            <h3 className="text-lg font-extrabold tracking-tight">{artist.name}</h3>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t("admin.common.close")}
          </Button>
        </header>

        {!loaded ? (
          <p className="text-sm text-muted-foreground">{t("admin.tags.editorLoading")}</p>
        ) : (
          <TagEditor
            value={selected}
            onChange={setSelected}
            hint={t("admin.tags.drawerHint")}
          />
        )}

        {err && <p className="text-xs text-destructive">{err}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t("admin.common.cancel")}
          </Button>
          <Button type="button" onClick={onSave} disabled={saving || !loaded} className="font-bold">
            {saving ? "…" : t("admin.common.save")}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ArtistCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Combobox
      value={value}
      onChange={onChange}
      onPick={(item) => onChange(item.label)}
      search={async (q): Promise<ComboboxItem[]> => {
        const hits = await searchDeezerArtists(q)
        return hits.map((a) => ({ key: a.id, label: a.name, imageUrl: a.imageUrl }))
      }}
      placeholder={t("admin.create.deezerSearchPlaceholder")}
      required
    />
  )
}

function TrackCombobox({
  value,
  onChange,
  onPickTrack,
}: {
  value: string
  onChange: (v: string) => void
  onPickTrack: (t: {
    trackId: string
    title: string
    artistName: string
    albumTitle: string
    albumArtUrl: string | null
    releaseYear: number | null
  }) => void | Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <Combobox
      value={value}
      onChange={onChange}
      onPick={(item) => {
        const meta = (item as ComboboxItem & {
          meta?: {
            title: string
            artistName: string
            albumTitle: string
            albumArtUrl: string | null
            releaseYear: number | null
          }
        }).meta
        if (meta) {
          onPickTrack({ trackId: item.key, ...meta })
        } else {
          onChange(item.label)
        }
      }}
      search={async (q): Promise<ComboboxItem[]> => {
        const hits = await searchDeezerTracks(q)
        return hits.map((t) => ({
          key: t.trackId,
          label: t.title,
          sublabel: `${t.artistName}${t.albumTitle ? ` · ${t.albumTitle}` : ""}${
            t.releaseYear ? ` · ${t.releaseYear}` : ""
          }`,
          imageUrl: t.albumArtUrl,
          // Carry the full hit so onPick can prefill artist/album/year/cover.
          meta: {
            title: t.title,
            artistName: t.artistName,
            albumTitle: t.albumTitle,
            albumArtUrl: t.albumArtUrl,
            releaseYear: t.releaseYear,
          },
        }))
      }}
      placeholder={t("admin.create.trackSearchPlaceholder")}
      required
    />
  )
}

export { patchBar }
