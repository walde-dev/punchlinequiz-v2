import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { isAdminFn } from "../../lib/session"

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
  loader: async () => {
    const { admin } = await isAdminFn()
    return { admin }
  },
})

function AdminLoginPage() {
  const { t } = useTranslation()
  const { admin } = Route.useLoaderData()
  const navigate = useNavigate()
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
        credentials: "same-origin",
      })
      if (res.ok) {
        await navigate({ to: "/admin" })
        return
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setError(body.message ?? t("admin.login.failed", { status: res.status }))
    } catch (err) {
      setError(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center px-5 py-12">
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-3xl border border-border/60 bg-card/60 p-6 backdrop-blur-[2px]">
        <div className="mb-6 flex flex-col gap-1">
          <span className="text-xs font-bold tracking-[0.18em] uppercase text-primary/80">
            {t("admin.eyebrow")}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("admin.login.title")}</h1>
          {admin ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.login.alreadyIn")}{" "}
              <button
                type="button"
                className="font-semibold text-primary underline-offset-2 hover:underline"
                onClick={() => navigate({ to: "/admin" })}
              >
                {t("admin.login.toDashboard")}
              </button>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("admin.login.prompt")}
            </p>
          )}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium tracking-wide uppercase text-muted-foreground">
            {t("admin.login.tokenLabel")}
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              autoFocus
              placeholder="••••••••••"
              className={cn(
                "rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 text-base font-medium tracking-wide text-foreground placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-2 focus:ring-ring/60",
              )}
            />
          </label>
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={submitting || token.trim().length === 0}
            className="mt-1 min-h-11 font-bold"
          >
            {submitting ? "…" : t("admin.login.submit")}
          </Button>
        </form>
      </div>
    </main>
  )
}
