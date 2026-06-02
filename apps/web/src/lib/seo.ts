/**
 * SEO helpers (PUN-76/77). Pure, SSR-safe builders for TanStack `head()`:
 * canonical + OG/Twitter meta, robots noindex, and JSON-LD structured data.
 *
 * Canonical host is .de (the .com → .de 301 is configured at the platform, not
 * here). Every absolute URL we emit (canonical, og:url, sitemap) is built from
 * SITE_URL so there's a single source of truth.
 */

export const SITE_URL = "https://punchlinequiz.de"
export const SITE_NAME = "punchlinequiz"
/** Static default share image until per-entity OG cards land (Daily Share Card project). */
export const DEFAULT_OG_IMAGE = "/banner-chains.png"
export const DEFAULT_DESCRIPTION =
  "punchlinequiz — errate den Künstler hinter der Punchline. Das Quiz für deutschen Rap. Spiel täglich, fordere Freunde heraus."

/** Absolute URL from a path or pass-through for an already-absolute URL. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`
}

type Tag = Record<string, string>

export type SeoInput = {
  /** Page title (without the site suffix); omit for the bare site name. */
  title?: string
  description?: string
  /** Path for canonical + og:url, e.g. "/artist/kollegah". Omit → no canonical. */
  path?: string
  /** og/twitter image (path or absolute). Defaults to the site banner. */
  image?: string
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
export function seo(input: SeoInput = {}): { meta: Tag[]; links: Tag[] } {
  const fullTitle = input.title ? `${input.title} · ${SITE_NAME}` : SITE_NAME
  const description = input.description ?? DEFAULT_DESCRIPTION
  const image = absoluteUrl(input.image ?? DEFAULT_OG_IMAGE)
  const url = input.path ? absoluteUrl(input.path) : undefined

  const meta: Tag[] = [
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

  const links: Tag[] = url ? [{ rel: "canonical", href: url }] : []
  return { meta, links }
}

/** Convenience for app-utility routes that should never be indexed. */
export function noindexSeo(): { meta: Tag[]; links: Tag[] } {
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
  genre?: string[]
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

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): Record<string, unknown> {
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
