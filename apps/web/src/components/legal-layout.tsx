import { AppHeader } from "./app-header"
import type { ReactNode } from "react"


/**
 * Shared chrome + typography for the legal pages (Impressum, Datenschutz,
 * Nutzungsbedingungen). Keeps the brand look — dark, gold accents, generous
 * line-height for long-form reading — without leaning on a `prose` plugin.
 * The site-wide <SiteFooter/> (rendered in __root) carries the cross-links, so
 * this layout doesn't repeat them.
 */
export function LegalLayout({
  eyebrow,
  title,
  lastUpdated,
  children,
}: {
  eyebrow: string
  title: string
  lastUpdated: string
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <main className="relative mx-auto w-full max-w-2xl flex-1 px-5 pt-24 pb-16 md:px-8">
        <header className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
            {eyebrow}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground/60">{lastUpdated}</p>
        </header>
        <article className="mt-8 flex flex-col">{children}</article>
      </main>
    </div>
  )
}

/** Section heading inside a legal article. */
export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-8 mb-2 text-lg font-bold tracking-tight text-foreground first:mt-0">
      {children}
    </h2>
  )
}

/** Sub-heading for nested clauses. */
export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 mb-1.5 text-sm font-bold tracking-tight text-foreground/90">{children}</h3>
}

/** Body paragraph. */
export function P({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{children}</p>
}

/** Bulleted list. */
export function UL({ children }: { children: ReactNode }) {
  return <ul className="mb-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">{children}</ul>
}

export function LI({ children }: { children: ReactNode }) {
  return <li>{children}</li>
}

/** Inline link, gold accent. External links open in a new tab. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http")
  return (
    <a
      href={href}
      className="text-primary underline-offset-2 hover:underline"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  )
}

/** Address / key-value block (used for the Impressum operator details). */
export function AddressBlock({ children }: { children: ReactNode }) {
  return (
    <address className="mb-3 text-sm not-italic leading-relaxed text-muted-foreground">{children}</address>
  )
}
