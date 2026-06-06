import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"

import { AppHeader } from "../components/app-header"
import { getInviterFn } from "../lib/referral"
import { setReferralToken } from "../lib/referral-client"
import { noindexSeo } from "../lib/seo"
import { logEvent } from "../lib/track"

/**
 * Invite landing (PUN-73). A shared /i/$handle link sets a first-touch referral
 * token (invite → this handle), then funnels the visitor into a game. If the
 * visitor later signs up, the inviter is credited at onboarding.
 */
export const Route = createFileRoute("/i/$handle")({
  component: InvitePage,
  head: () => noindexSeo(),
  loader: async ({ params }) =>
    getInviterFn({ data: { handle: params.handle } }),
})

function InvitePage() {
  const { t } = useTranslation()
  const { handle } = Route.useParams()
  const inviter = Route.useLoaderData()

  useEffect(() => {
    if (!inviter.found) return
    setReferralToken({ source: "invite", value: inviter.handle })
    logEvent("referral_landing_viewed", {
      source: "invite",
      handle: inviter.handle,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const title = inviter.found
    ? t("invite.title", { handle: inviter.handle })
    : t("invite.fallbackTitle")

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {inviter.found && (
          <InviterAvatar handle={inviter.handle} imageUrl={inviter.imageUrl} />
        )}
        <span className="text-xs font-bold tracking-[0.18em] text-primary/80 uppercase">
          {t("invite.eyebrow")}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-balance">
          {title}
        </h1>
        <p className="max-w-xs text-sm text-balance text-muted-foreground">
          {t("invite.subtitle")}
        </p>

        <div className="flex w-full flex-col items-center gap-2">
          <Button
            size="lg"
            className="cta-glow min-h-12 w-full max-w-xs text-base font-bold"
            render={<Link to="/play" />}
          >
            {t("invite.ctaPlay")}
          </Button>
          <Button
            variant="ghost"
            className="min-h-11 w-full max-w-xs border border-border/60 text-sm font-bold"
            render={<Link to="/daily" />}
          >
            {t("invite.ctaDaily")}
          </Button>
        </div>
      </main>
      {/* Anchor the otherwise-unused handle param for clarity in logs/devtools. */}
      <span hidden>{handle}</span>
    </div>
  )
}

function InviterAvatar({
  handle,
  imageUrl,
}: {
  handle: string
  imageUrl: string | null
}) {
  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/60 bg-card">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-2xl font-extrabold text-primary">@</span>
      )}
      <span className="sr-only">@{handle}</span>
    </div>
  )
}
