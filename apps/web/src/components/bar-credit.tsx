import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

/**
 * Public contributor credit shown wherever a bar's meta appears (during play +
 * on reveal, across play/daily/challenge). Renders nothing for admin-authored
 * bars (no contributor handle). PUN-67.
 */
export function BarCredit({
  handle,
  className,
}: {
  handle: string | null | undefined
  className?: string
}) {
  const { t } = useTranslation()
  if (!handle) return null
  return (
    <Link
      to="/u/$handle"
      params={{ handle }}
      onClick={(e) => e.stopPropagation()}
      className={
        "inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground/70 transition-colors hover:text-primary " +
        (className ?? "")
      }
    >
      <span className="opacity-70">{t("bar.submittedBy")}</span>
      <span className="text-primary/80">@{handle}</span>
    </Link>
  )
}
