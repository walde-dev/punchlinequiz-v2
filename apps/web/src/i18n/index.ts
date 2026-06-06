import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import de from "./locales/de.json"
import en from "./locales/en.json"

/** localStorage key holding the user's language choice. Kept as "i18nextLng"
 *  (the legacy i18next-browser-languagedetector key) so prefs saved before this
 *  change still apply. Read/written by LangSync + LangToggle. */
export const LANG_STORAGE_KEY = "i18nextLng"

i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  // Pin the initial language so SSR and the first client render agree (both
  // German, matching <html lang="de">). Auto-detection used to diverge — "de" on
  // the server (no localStorage/navigator) vs the visitor's browser language on
  // the client → every t() string mismatched → React #418 hydration error. The
  // stored/browser preference is applied AFTER hydration by LangSync in
  // __root.tsx (and persisted by LangToggle), so EN users still get English.
  lng: "de",
  fallbackLng: "de",
  supportedLngs: ["de", "en"],
  interpolation: { escapeValue: false },
})

export default i18n
