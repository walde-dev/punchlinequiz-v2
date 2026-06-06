/**
 * SEO helpers (PUN-76/77). Pure, SSR-safe builders for TanStack `head()`:
 * canonical + OG/Twitter meta, robots noindex, and JSON-LD structured data.
 *
 * Canonical host is www.punchlinequiz.de — the apex (punchlinequiz.de) and the
 * .com both 308→www at the platform. SITE_URL MUST be the post-redirect host:
 * social scrapers (WhatsApp/Twitter) often don't follow redirects, so an apex
 * og:image resolved to a 308 (not the PNG) and link cards unfurled blank.
 * Every absolute URL we emit (canonical, og:url, og:image, sitemap) is built
 * from SITE_URL so there's a single source of truth.
 */

export const SITE_URL = "https://www.punchlinequiz.de"
export const SITE_NAME = "punchlinequiz"
/**
 * Static last-resort share image. Used ONLY as the dynamic OG route's failure
 * fallback (see routes/api/og.tsx) — every real page now defaults to a generated
 * 1200×630 card via ogImageUrl(), not this 1:1 banner.
 */
export const DEFAULT_OG_IMAGE = "/banner-chains.png"
export const DEFAULT_DESCRIPTION =
  "punchlinequiz — errate den Künstler hinter der Punchline. Das Quiz für deutschen Rap. Spiel täglich, fordere Freunde heraus."
/** Default subtitle/CTA baked into auto-generated OG cards when none is given. */
export const OG_DEFAULT_SUBTITLE = "Das Quiz für deutschen Rap"

/** Absolute URL from a path or pass-through for an already-absolute URL. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`
}

/**
 * Absolute URL to the dynamic OG image route (PUN-105). Any page can build a
 * branded per-entity unfurl card from a title + optional subtitle/image.
 * og:image must be absolute (scrapers don't resolve relative paths), so this
 * always returns a SITE_URL-rooted URL.
 */
export function ogImageUrl(input: {
  title: string
  subtitle?: string
  image?: string | null
}): string {
  const qs = new URLSearchParams()
  qs.set("title", input.title)
  if (input.subtitle) qs.set("subtitle", input.subtitle)
  if (input.image) qs.set("image", input.image)
  return absoluteUrl(`/api/og?${qs.toString()}`)
}

type Tag = Record<string, string>

export type SeoInput = {
  /** Page title (without the site suffix); omit for the bare site name. */
  title?: string
  description?: string
  /** Path for canonical + og:url, e.g. "/artist/kollegah". Omit → no canonical. */
  path?: string
  /** og/twitter image (path or absolute). Omit → an auto-generated dynamic card. */
  image?: string
  /** Headline for the auto-generated OG card (when no `image`). Defaults to `title`. */
  ogTitle?: string
  /** Subtitle/CTA for the auto-generated OG card. Defaults to OG_DEFAULT_SUBTITLE. */
  ogSubtitle?: string
  /** og:type — "website" (default), "music.musician", etc. */
  type?: string
  /** Emit robots noindex,follow (app-utility / non-catalog pages). */
  noindex?: boolean
}

/**
 * Build the meta + links for a route's head(). Default OG/Twitter live in the
 * root route; child routes call this to override per-page. TanStack dedupes
 * meta by name/property/title (deepest wins) so overrides are clean. Canonical
 * is only emitted when `path` is given (avoids duplicate canonical tags).
 */
export function seo(input: SeoInput = {}): {
  meta: Array<Tag>
  links: Array<Tag>
} {
  const fullTitle = input.title ? `${input.title} · ${SITE_NAME}` : SITE_NAME
  const description = input.description ?? DEFAULT_DESCRIPTION
  // Default to a generated 1200×630 branded card (headline + CTA, ~60KB) instead
  // of the static 1:1 banner — fixes ratio/size/headline for every page at once.
  const image = input.image
    ? absoluteUrl(input.image)
    : ogImageUrl({
        title: input.ogTitle ?? input.title ?? SITE_NAME,
        subtitle: input.ogSubtitle ?? OG_DEFAULT_SUBTITLE,
      })
  const url = input.path ? absoluteUrl(input.path) : undefined

  const meta: Array<Tag> = [
    { title: fullTitle },
    { name: "description", content: description },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:image", content: image },
    { property: "og:site_name", content: SITE_NAME },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ]
  if (url) meta.push({ property: "og:url", content: url })
  if (input.noindex) meta.push({ name: "robots", content: "noindex,follow" })

  const links: Array<Tag> = url ? [{ rel: "canonical", href: url }] : []
  return { meta, links }
}

/** Convenience for app-utility routes that should never be indexed. */
export function noindexSeo(): { meta: Array<Tag>; links: Array<Tag> } {
  return seo({ noindex: true })
}

/** Wrap a structured-data object into a head() script entry. */
export function jsonLd(data: Record<string, unknown>): {
  type: string
  children: string
} {
  return { type: "application/ld+json", children: JSON.stringify(data) }
}

// ---- schema.org builders ---------------------------------------------------

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "de",
  }
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon-512.png"),
  }
}

export function musicGroupJsonLd(input: {
  name: string
  slug: string
  image?: string | null
  genre?: Array<string>
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: input.name,
    url: absoluteUrl(`/artist/${input.slug}`),
    ...(input.image ? { image: input.image } : {}),
    ...(input.genre && input.genre.length ? { genre: input.genre } : {}),
  }
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  }
}
