import { Select } from "@base-ui/react/select"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@workspace/ui/lib/utils"

import type { ArtistRow } from "../lib/admin-client"

/**
 * Shadcn-style artist dropdown built on `@base-ui/react` Select.
 *
 * When `sortByOverlapWith` is provided, options are sorted by tag overlap
 * with that reference artist (descending). That makes distractor pickers
 * surface scene-matching artists first ("Bushido" → Fler / Sido / Kollegah
 * before Shirin David).
 */
export function ArtistSelect({
  value,
  onChange,
  artists,
  excludeId,
  sortByOverlapWith,
  placeholder,
  className,
}: {
  value: number
  onChange: (id: number) => void
  artists: ArtistRow[]
  excludeId?: number
  sortByOverlapWith?: ArtistRow | null
  placeholder?: string
  className?: string
}) {
  const { t } = useTranslation()
  const sorted = useMemo(
    () => sortArtists(artists, sortByOverlapWith ?? null, excludeId, value),
    [artists, sortByOverlapWith, excludeId, value],
  )
  const refTags = new Set(sortByOverlapWith?.tags ?? [])

  return (
    <Select.Root
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
      items={sorted.map((a) => ({
        value: String(a.id),
        label: a.name,
      }))}
    >
      <Select.Trigger
        className={cn(
          "flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium",
          "focus:outline-none focus:ring-2 focus:ring-ring/60",
          "data-[popup-open]:border-primary/60",
          className,
        )}
      >
        <Select.Value placeholder={placeholder ?? t("artistSelect.placeholder")} />
        <Select.Icon className="ml-2 text-muted-foreground">
          <ChevronIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          sideOffset={6}
          align="start"
          className="z-[60] outline-none"
        >
          <Select.Popup
            className={cn(
              "max-h-[min(60vh,420px)] min-w-[var(--anchor-width)] overflow-y-auto rounded-2xl border border-border/60",
              "bg-popover/95 shadow-2xl backdrop-blur-sm",
              "p-1 text-sm",
            )}
          >
            {sorted.map((a) => {
              const overlap = scoreOverlap(a.tags ?? [], refTags)
              return (
                <Select.Item
                  key={a.id}
                  value={String(a.id)}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium select-none",
                    "data-[highlighted]:bg-primary/15 data-[highlighted]:text-foreground",
                    "data-[selected]:font-bold",
                    !a.active && "opacity-60",
                  )}
                >
                  <Select.ItemIndicator className="w-3 text-primary">
                    ✓
                  </Select.ItemIndicator>
                  <span className="flex w-3 group-data-[selected]:hidden" />
                  <Select.ItemText>{a.name}</Select.ItemText>
                  {!a.active && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("artistSelect.inactive")}
                    </span>
                  )}
                  {overlap > 0 && (
                    <span
                      className="ml-auto text-[10px] font-bold tabular-nums text-primary/70"
                      title={t("artistSelect.sharedTags", { count: overlap })}
                    >
                      ×{overlap}
                    </span>
                  )}
                </Select.Item>
              )
            })}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

function sortArtists(
  artists: ArtistRow[],
  reference: ArtistRow | null,
  excludeId: number | undefined,
  selectedId: number,
): ArtistRow[] {
  // Always keep the currently selected artist in the list (even if excluded
  // by id) so the trigger has a value to render.
  const filtered = artists.filter(
    (a) => a.id !== excludeId || a.id === selectedId,
  )
  if (!reference || !reference.tags || reference.tags.length === 0) {
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "de"))
  }
  const refTags = new Set(reference.tags)
  return [...filtered].sort((a, b) => {
    const oa = scoreOverlap(a.tags ?? [], refTags)
    const ob = scoreOverlap(b.tags ?? [], refTags)
    if (oa !== ob) return ob - oa
    return a.name.localeCompare(b.name, "de")
  })
}

function scoreOverlap(tags: string[], ref: Set<string>): number {
  let n = 0
  for (const t of tags) if (ref.has(t)) n++
  return n
}

function ChevronIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
