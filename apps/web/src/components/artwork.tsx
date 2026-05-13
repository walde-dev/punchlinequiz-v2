import { cn } from "@workspace/ui/lib/utils"

type ArtistLike = {
  name: string
  imageUrl: string | null
}

type SongLike = {
  title: string
  albumArtUrl: string | null
}

type Size = 64 | 96 | 160

const sizeToPx: Record<Size, number> = { 64: 64, 96: 96, 160: 160 }

function artistInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }
  return (words[0][0] + words[1][0]).toUpperCase()
}

function coverInitial(title: string): string {
  const t = title.trim()
  return t.length > 0 ? t[0].toUpperCase() : "?"
}

function Monogram({
  initials,
  size,
  shape,
  className,
}: {
  initials: string
  size: number
  shape: "circle" | "square"
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-card text-primary font-extrabold tracking-tight select-none",
        shape === "circle" ? "rounded-full" : "rounded-md",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(12, Math.round(size * 0.38)),
        backgroundColor: "#1f1f1f",
        color: "#fbbf24",
      }}
    >
      {initials}
    </div>
  )
}

export function ArtistArt({
  artist,
  size = 96,
  className,
}: {
  artist: ArtistLike
  size?: Size
  className?: string
}) {
  const px = sizeToPx[size]
  if (artist.imageUrl) {
    return (
      <img
        src={artist.imageUrl}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={cn("rounded-full object-cover bg-card", className)}
        style={{ width: px, height: px }}
      />
    )
  }
  return (
    <Monogram
      initials={artistInitials(artist.name)}
      size={px}
      shape="circle"
      className={className}
    />
  )
}

export function CoverArt({
  song,
  size = 160,
  className,
}: {
  song: SongLike
  size?: Size
  className?: string
}) {
  const px = sizeToPx[size]
  if (song.albumArtUrl) {
    return (
      <img
        src={song.albumArtUrl}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={cn("rounded-md object-cover bg-card", className)}
        style={{ width: px, height: px }}
      />
    )
  }
  return (
    <Monogram
      initials={coverInitial(song.title)}
      size={px}
      shape="square"
      className={className}
    />
  )
}
