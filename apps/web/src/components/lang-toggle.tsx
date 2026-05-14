import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"

export function LangToggle() {
  const { t, i18n } = useTranslation()
  const isDE = i18n.language.startsWith("de")

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => i18n.changeLanguage(isDE ? "en" : "de")}
      aria-label={isDE ? t("common.switchToEnglish") : t("common.switchToGerman")}
      className="min-h-11 min-w-11 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {isDE ? "DE" : "EN"}
    </Button>
  )
}
