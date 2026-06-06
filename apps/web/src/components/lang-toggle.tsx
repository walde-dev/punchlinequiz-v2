import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"

import { LANG_STORAGE_KEY } from "../i18n"

export function LangToggle() {
  const { t, i18n } = useTranslation()
  const isDE = i18n.language.startsWith("de")

  const toggle = () => {
    const next = isDE ? "en" : "de"
    // Persist the choice ourselves (no language-detector anymore) so it's
    // re-applied after hydration on the next visit. See LangSync in __root.
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // ignore unavailable storage
    }
    void i18n.changeLanguage(next)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={isDE ? t("common.switchToEnglish") : t("common.switchToGerman")}
      className="min-h-11 min-w-11 text-xs font-bold tracking-wide text-foreground/70 transition-colors hover:bg-transparent hover:text-primary"
    >
      {isDE ? "DE" : "EN"}
    </Button>
  )
}
