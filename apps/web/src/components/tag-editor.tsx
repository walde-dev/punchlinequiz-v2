import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { createTag, fetchTags, type TagRow } from "../lib/admin-client"

export type SelectedTag = { slug: string; label: string; weight: number }

const DEFAULT_WEIGHT = 0.8

/**
 * Multi-select tag picker with per-tag weight (0..1).
 *
 * Pulls the live tag dictionary from /api/admin/tags. Lets the user toggle
 * existing tags, adjust each weight, and create new tags inline. The parent
 * owns the selection state (`value` / `onChange`).
 */
export function TagEditor({
  value,
  onChange,
  hint,
}: {
  value: SelectedTag[]
  onChange: (next: SelectedTag[]) => void
  hint?: string
}) {
  const [all, setAll] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState("")
  const [creating, setCreating] = useState(false)

  async function loadTags() {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetchTags()
      setAll(r.items)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTags()
  }, [])

  const selectedSlugs = new Set(value.map((t) => t.slug))

  function toggle(tag: TagRow) {
    if (selectedSlugs.has(tag.slug)) {
      onChange(value.filter((t) => t.slug !== tag.slug))
    } else {
      onChange([...value, { slug: tag.slug, label: tag.label, weight: DEFAULT_WEIGHT }])
    }
  }

  function setWeight(slug: string, weight: number) {
    onChange(value.map((t) => (t.slug === slug ? { ...t, weight } : t)))
  }

  async function onCreate() {
    const label = newLabel.trim()
    if (!label) return
    setCreating(true)
    setErr(null)
    try {
      const tag = await createTag(label)
      setNewLabel("")
      // optimistic: add to list + select
      setAll((prev) => {
        if (prev.some((t) => t.slug === tag.slug)) return prev
        return [...prev, { id: tag.id, slug: tag.slug, label: tag.label, artistCount: 0 }].sort(
          (a, b) => a.label.localeCompare(b.label),
        )
      })
      if (!selectedSlugs.has(tag.slug)) {
        onChange([...value, { slug: tag.slug, label: tag.label, weight: DEFAULT_WEIGHT }])
      }
    } catch (e) {
      setErr(String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}

      {/* picker */}
      <div className="flex flex-wrap gap-1.5">
        {loading && <span className="text-xs text-muted-foreground">Lädt …</span>}
        {!loading &&
          all.map((tag) => {
            const isOn = selectedSlugs.has(tag.slug)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                  isOn
                    ? "border-primary/70 bg-primary/15 text-primary"
                    : "border-border/50 bg-background/40 text-muted-foreground hover:border-border/80 hover:text-foreground",
                )}
                title={`${tag.slug}${tag.artistCount > 0 ? ` · ${tag.artistCount} artists` : ""}`}
              >
                {tag.label}
              </button>
            )
          })}
      </div>

      {/* weights */}
      {value.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-background/30 p-3">
          {value.map((t) => (
            <div key={t.slug} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-[11px] font-semibold uppercase tracking-wide text-primary">
                {t.label}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={t.weight}
                onChange={(e) => setWeight(t.slug, Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="w-10 text-right text-[11px] font-mono tabular-nums text-muted-foreground">
                {t.weight.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* create new */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onCreate()
            }
          }}
          placeholder="Neuer Tag (Label) …"
          className="flex-1 rounded-full border border-border/40 bg-background/40 px-3 py-1.5 text-xs font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/60"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCreate}
          disabled={creating || !newLabel.trim()}
          className="text-xs font-semibold"
        >
          + Tag
        </Button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  )
}
