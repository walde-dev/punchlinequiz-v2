import { useEffect, useId, useRef, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

export type ComboboxItem = {
  key: string
  label: string
  sublabel?: string
  imageUrl?: string | null
}

type Props = {
  value: string
  onChange: (v: string) => void
  onPick: (item: ComboboxItem) => void
  search: (q: string) => Promise<ComboboxItem[]>
  placeholder?: string
  className?: string
  required?: boolean
  disabled?: boolean
  /** Min chars before triggering a search. Default 2. */
  minChars?: number
}

const inputCls =
  "w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/60"

export function Combobox({
  value,
  onChange,
  onPick,
  search,
  placeholder,
  className,
  required,
  disabled,
  minChars = 2,
}: Props) {
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<ComboboxItem[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqRef = useRef(0)
  const listboxId = useId()

  // Debounced search whenever the input changes while focused.
  useEffect(() => {
    if (!open) return
    if (value.trim().length < minChars) {
      setHits([])
      setLoading(false)
      return
    }
    const myReq = ++reqRef.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const out = await search(value)
        if (myReq === reqRef.current) {
          setHits(out)
          setActive(0)
        }
      } finally {
        if (myReq === reqRef.current) setLoading(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [value, open, minChars, search])

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  function pick(item: ComboboxItem) {
    onPick(item)
    setOpen(false)
    setHits([])
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(hits.length - 1, a + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === "Enter") {
      if (open && hits[active]) {
        e.preventDefault()
        pick(hits[active])
      }
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        className={inputCls}
      />
      {open && (loading || hits.length > 0 || value.trim().length >= minChars) && (
        <ul
          id={listboxId}
          role="listbox"
          className={cn(
            "absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border/60",
            "bg-popover/95 shadow-2xl backdrop-blur-sm",
          )}
        >
          {loading && hits.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">Suche …</li>
          )}
          {!loading && hits.length === 0 && value.trim().length >= minChars && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Keine Treffer. Eingabe wird als neuer Eintrag angelegt.
            </li>
          )}
          {hits.map((item, i) => {
            const isActive = i === active
            return (
              <li key={item.key} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    // Use mousedown so blur doesn't close before click fires.
                    e.preventDefault()
                    pick(item)
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left",
                    isActive ? "bg-primary/15 text-foreground" : "hover:bg-muted/40",
                  )}
                >
                  <Thumb url={item.imageUrl ?? null} alt={item.label} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{item.label}</span>
                    {item.sublabel && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.sublabel}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    const initials = alt
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-[10px] font-bold text-foreground/70">
        {initials}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className="h-8 w-8 shrink-0 rounded-md object-cover"
    />
  )
}
