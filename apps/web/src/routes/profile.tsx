import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { SignInButton } from "@clerk/tanstack-react-start"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { AppHeader } from "../components/app-header"
import { rankIconPath } from "../lib/rank-icon"
import { getMyHandleFn } from "../lib/profile"
import { getProfileFn, type ProfileFnResult } from "../lib/session"

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  // Profiles are unified at /u/$handle. Onboarded users redirect to their
  // public page; un-onboarded + anonymous users fall through to the existing
  // self view / sign-in pitch (handle claiming is the parallel onboarding work).
  loader: async () => {
    const me = await getMyHandleFn()
    if (me.signedIn && me.handle) {
      throw redirect({ to: "/u/$handle", params: { handle: me.handle } })
    }
    return { profile: await getProfileFn() }
  },
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function ProfilePage() {
  const { profile } = Route.useLoaderData() as { profile: ProfileFnResult }
  if (!profile.signedIn) return <AnonymousPitch preview={profile.preview} />
  return <SignedInProfile result={profile} />
}

function AnonymousPitch({ preview }: { preview: Extract<ProfileFnResult, { signedIn: false }>["preview"] }) {
  const { t, i18n } = useTranslation()
  const nextName = preview.nextLevel
    ? i18n.language.startsWith("de")
      ? preview.nextLevel.nameDe
      : preview.nextLevel.nameEn
    : null
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary/70">
          {t("profile.anon.eyebrow")}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-balance">
          {t("profile.anon.headline")}
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground text-balance">
          {nextName
            ? t("profile.anon.subtextWithNext", { rank: nextName })
            : t("profile.anon.subtext")}
        </p>
        <SignInButton mode="modal">
          <Button size="lg" className="cta-glow min-h-12 px-8 text-base font-bold">
            {t("profile.anon.cta")}
          </Button>
        </SignInButton>
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t("common.back")}
        </Link>
      </main>
    </div>
  )
}

function SignedInProfile({ result }: { result: Extract<ProfileFnResult, { signedIn: true }> }) {
  const { profile } = result
  const { t, i18n } = useTranslation()
  const isDe = i18n.language.startsWith("de")
  const levelName = isDe ? profile.level.nameDe : profile.level.nameEn
  const nextLevelName = profile.nextLevel
    ? isDe
      ? profile.nextLevel.nameDe
      : profile.nextLevel.nameEn
    : null
  const xpToNext = profile.nextLevel ? profile.nextLevel.threshold - profile.totalXp : 0

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div className="pq-spotlight pointer-events-none absolute inset-0" aria-hidden="true" />

      <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-5 pt-20 pb-12 md:px-8">
        {/* Hero */}
        <section
          className="flex flex-col items-center gap-4 text-center"
          style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
            {t("profile.levelLabel")} {profile.level.rank}
          </span>
          <img
            src={rankIconPath(profile.level.rank)}
            alt=""
            aria-hidden="true"
            width={160}
            height={160}
            className="select-none"
            style={{
              animation: `pq-pop-in 0.55s ${ease} 0.05s both`,
              filter:
                "drop-shadow(0 0 32px color-mix(in oklch, var(--primary), transparent 55%))",
            }}
          />
          <h1
            className="font-extrabold tracking-tight text-primary text-balance"
            style={{
              fontSize: "clamp(2.25rem, 8vw, 3.5rem)",
              lineHeight: 1.05,
              textShadow: "0 0 50px rgba(251,191,36,0.35)",
            }}
          >
            {levelName}
          </h1>
          <p className="text-xl font-extrabold tabular-nums text-foreground">
            {profile.totalXp.toLocaleString(isDe ? "de-DE" : "en-US")} XP
          </p>
          <ProgressBar pct={profile.progressPct} />
          {nextLevelName ? (
            <p className="text-xs text-muted-foreground">
              {t("profile.nextLevelCaption", { xp: xpToNext.toLocaleString(isDe ? "de-DE" : "en-US"), rank: nextLevelName })}
            </p>
          ) : (
            <p className="text-xs text-primary">{t("profile.maxLevelReached")}</p>
          )}
        </section>

        {/* Stats row */}
        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          style={{ animation: `pq-fade-up 0.55s ${ease} 0.08s both` }}
        >
          <StatTile
            label={t("profile.stats.currentStreak")}
            value={profile.currentStreak}
            icon="🔥"
          />
          <StatTile
            label={t("profile.stats.longestStreak")}
            value={profile.longestStreak}
            icon="⚡"
          />
          <StatTile
            label={t("profile.stats.linesConquered")}
            value={profile.linesConquered}
          />
          <StatTile
            label={t("profile.stats.daysCompleted")}
            value={profile.daysCompleted}
          />
        </section>

        {/* Sparkline */}
        <section
          className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-5"
          style={{ animation: `pq-fade-up 0.55s ${ease} 0.16s both` }}
        >
          <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80">
            {t("profile.sparklineTitle")}
          </h2>
          <Sparkline data={profile.last30Days} />
        </section>

        {/* Recent grants */}
        {profile.recent.length > 0 && (
          <section
            className="flex flex-col gap-3"
            style={{ animation: `pq-fade-up 0.55s ${ease} 0.24s both` }}
          >
            <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80">
              {t("profile.recentTitle")}
            </h2>
            <ul className="flex flex-col gap-2">
              {profile.recent.map((r, i) => (
                <li
                  key={r.punchlineId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/30 px-4 py-3"
                  style={{ animation: `pq-fade-up 0.4s ${ease} ${0.28 + i * 0.04}s both` }}
                >
                  <span className="line-clamp-2 text-sm font-semibold text-foreground/90">
                    "{r.line.split("/")[0].trim()}"
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold tabular-nums text-primary">
                    +{r.xpAwarded}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div
          className="flex justify-center pt-2"
          style={{ animation: `pq-fade-up 0.5s ${ease} 0.4s both` }}
        >
          <Link
            to="/play"
            className="cta-glow inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-8 text-base font-bold text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-transform duration-150"
          >
            {t("profile.playMore")}
          </Link>
        </div>
      </main>
    </div>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="relative h-2 w-full max-w-xs overflow-hidden rounded-full bg-primary/15">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/80 to-primary"
        style={{
          width: `${pct}%`,
          transition: "width 600ms cubic-bezier(0.23, 1, 0.32, 1)",
          boxShadow: "0 0 16px color-mix(in oklch, var(--primary), transparent 50%)",
        }}
      />
    </div>
  )
}

function StatTile({ label, value, icon }: { label: string; value: number; icon?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl border border-border/40 bg-card/30 px-3 py-4",
      )}
    >
      <span className="text-2xl font-extrabold tabular-nums text-foreground">
        {icon && <span aria-hidden="true" className="mr-1">{icon}</span>}
        {value}
      </span>
      <span className="text-center text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function Sparkline({ data }: { data: Array<{ date: string; xp: number }> }) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.xp)), [data])
  return (
    <div className="flex h-20 items-end gap-[3px]" aria-hidden="true">
      {data.map((d) => {
        const h = (d.xp / max) * 100
        const hasXp = d.xp > 0
        return (
          <div
            key={d.date}
            className="relative flex-1 overflow-hidden rounded-sm"
            style={{ height: "100%" }}
          >
            <div
              className={cn(
                "absolute bottom-0 left-0 right-0 rounded-sm",
                hasXp ? "bg-primary/80" : "bg-primary/10",
              )}
              style={{
                height: hasXp ? `${Math.max(6, h)}%` : "6%",
                transition: "height 600ms cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
