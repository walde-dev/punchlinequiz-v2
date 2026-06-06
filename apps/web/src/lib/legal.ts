/**
 * Single source of truth for the operator's legal identity. Used by the
 * Impressum, the Datenschutzerklärung (controller block), the Nutzungsbedingungen,
 * and the site footer so the company data never drifts between pages.
 *
 * Operator: YANGOT Technologies UG (haftungsbeschränkt), Unterhaching, Germany.
 * Keep these accurate — § 5 DDG requires the Impressum data to be correct and
 * current.
 */
export const LEGAL = {
  companyName: "YANGOT Technologies UG (haftungsbeschränkt)",
  street: "Fasanenstraße 67i",
  zip: "82008",
  city: "Unterhaching",
  country: "Deutschland",
  countryEn: "Germany",
  managingDirector: "Waldemar Panin",
  registerCourt: "Amtsgericht München",
  registerNumber: "HRB 302455",
  vatId: "DE455070918",
  email: "walde@yangotstudios.com",
  /** Display string for the contact email (kept identical to `email`). */
  emailHref: "mailto:walde@yangotstudios.com",
  /** Date the legal pages were last reviewed. Bump on every substantive edit. */
  lastUpdatedDe: "6. Juni 2026",
  lastUpdatedEn: "June 6, 2026",
} as const
