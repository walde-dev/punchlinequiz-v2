import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { SignUpButton, useAuth } from "@clerk/tanstack-react-start"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { AppHeader } from "../components/app-header"
import { Confetti } from "../components/confetti"
import { LevelLadder } from "../components/level-ladder"
import { rankIconPath } from "../lib/rank-icon"
import {
  followByHandleFn,
  getPublicProfileFn,
  unfollowByHandleFn,
} from "../lib/profile"
import { createChallengeFn } from "../lib/challenge"
import { getMyReferralsFn, markReferralsSeenFn } from "../lib/referral"
import { noindexSeo } from "../lib/seo"
import { getMySubmissionsFn, markAcceptanceSeenFn } from "../lib/submissions"
import { logEvent } from "../lib/track"
import type { MySubmission } from "../lib/submissions"
import type { MyReferralsResult } from "../lib/referral"
import type { PublicProfileResult, TopArtist } from "../lib/profile"
import type { CSSProperties, ReactNode } from "react"
import type { ContributorProfile, ContributorTier } from "../lib/contributor"

export const Route = createFileRoute("/u/$handle")({
  component: PublicProfilePage,
  head: () => noindexSeo(),
  loader: async ({ params }) => ({
    data: await getPublicProfileFn({ data: { handle: params.handle } }),
  }),
})

const ease = "cubic-bezier(0.16, 1, 0.3, 1)"

function PublicProfilePage() {
  const { data } = Route.useLoaderData()
  const { handle } = Route.useParams()
  useEffect(() => {
    logEvent("profile_viewed", { handle })
  }, [handle])

  if (!data.found) return <NotFound handle={handle} />
  return <ProfileView data={data} />
}

function NotFound({ handle }: { handle: string }) {
  const { t } = useTranslation()
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="text-xs font-bold tracking-[0.18em] text-primary/70 uppercase">
          404
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {t("profile.public.notFoundTitle")}
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("profile.public.notFoundBody", { handle })}
        </p>
        <Link
          to="/leaderboard"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {t("nav.leaderboard")}
        </Link>
      </main>
    </div>
  )
}

function ProfileView({
  data,
}: {
  data: Extract<PublicProfileResult, { found: true }>
}) {
  const { t, i18n } = useTranslation()
  const isDe = i18n.language.startsWith("de")
  const { profile } = data
  const levelName = isDe ? profile.level.nameDe : profile.level.nameEn
  const nextLevelName = profile.nextLevel
    ? isDe
      ? profile.nextLevel.nameDe
      : profile.nextLevel.nameEn
    : null
  const xpToNext = profile.nextLevel
    ? profile.nextLevel.threshold - profile.totalXp
    : 0

  const [followers, setFollowers] = useState(data.followers)
  // Bump the follower count on change so a follow/unfollow lands with a beat.
  const [followerBump, setFollowerBump] = useState(0)
  const handleFollowersChange = (n: number) => {
    setFollowers(n)
    setFollowerBump((k) => k + 1)
  }

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <AppHeader />
      <div
        className="pq-spotlight pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-5 pt-20 pb-12 md:px-8">
        {/* Hero — one identity card: avatar, handle, level, followers; XP progress
            anchored along the bottom edge. Actions sit just below the card. */}
        <section
          className="flex flex-col items-center gap-4"
          style={{ animation: `pq-fade-up 0.55s ${ease} both` }}
        >
          <div className="relative flex w-full flex-col items-center gap-4 overflow-hidden rounded-3xl border border-border/60 bg-card/40 px-6 pt-8 pb-6 text-center backdrop-blur-sm">
            {/* Soft gold glow bleeding from the top, framing the avatar. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -top-20 h-40"
              style={{
                background:
                  "radial-gradient(closest-side, color-mix(in oklch, var(--primary), transparent 78%), transparent)",
              }}
            />

            <Avatar imageUrl={data.imageUrl} handle={data.handle} />

            <div className="flex flex-col items-center gap-2">
              <h1
                className="font-extrabold tracking-tight text-balance text-foreground"
                style={{
                  fontSize: "clamp(1.75rem, 7vw, 2.5rem)",
                  lineHeight: 1.05,
                }}
              >
                <span
                  className="font-bold text-primary/45"
                  style={{ fontSize: "0.6em" }}
                >
                  @
                </span>
                {data.handle}
              </h1>
              {/* Rank badge + level name, side by side — supporting, not the hero. */}
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1">
                <img
                  src={rankIconPath(profile.level.rank)}
                  alt=""
                  aria-hidden="true"
                  width={20}
                  height={20}
                  className="select-none"
                />
                <span className="text-xs font-bold tracking-[0.16em] text-primary uppercase">
                  {levelName}
                </span>
              </span>
            </div>

            {/* Follow counts, divided */}
            <div className="flex items-stretch justify-center gap-5 text-sm">
              <Count
                value={followers}
                bumpKey={followerBump}
                label={t("profile.public.followers")}
              />
              <span
                aria-hidden="true"
                className="w-px self-stretch bg-border/60"
              />
              <Count
                value={data.following}
                label={t("profile.public.following")}
              />
            </div>

            {/* XP progress — anchored along the card's bottom edge. */}
            <div className="mt-2 flex w-full flex-col items-center gap-1.5 border-t border-border/40 pt-4">
              <ProgressBar pct={profile.progressPct} />
              <p className="text-xs font-semibold text-muted-foreground tabular-nums">
                {profile.totalXp.toLocaleString(isDe ? "de-DE" : "en-US")} XP
                {nextLevelName ? (
                  <span className="opacity-70">
                    {" · "}
                    {t("profile.nextLevelCaption", {
                      xp: xpToNext.toLocaleString(isDe ? "de-DE" : "en-US"),
                      rank: nextLevelName,
                    })}
                  </span>
                ) : (
                  <span className="text-primary opacity-90">
                    {" · "}
                    {t("profile.maxLevelReached")}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Actions — below the identity card. */}
          <Actions data={data} onFollowersChange={handleFollowersChange} />
        </section>

        {/* Stats row */}
        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          style={{ animation: `pq-fade-up 0.55s ${ease} 0.08s both` }}
        >
          <h2 className="sr-only">{t("profile.statsTitle")}</h2>
          <StatTile
            label={t("profile.stats.currentStreak")}
            value={profile.currentStreak}
            accent={profile.currentStreak > 0}
          />
          <StatTile
            label={t("profile.stats.longestStreak")}
            value={profile.longestStreak}
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

        {/* Rank ladder — full progression, current rank centered. min-w-0 keeps
            the horizontal scroller from stretching the column to fit all ranks. */}
        <section
          className="flex min-w-0 flex-col gap-3"
          style={{ animation: `pq-fade-up 0.55s ${ease} 0.1s both` }}
        >
          <SectionHeading>{t("profile.levelsTitle")}</SectionHeading>
          <LevelLadder
            levels={data.allLevels}
            totalXp={profile.totalXp}
            currentRank={profile.level.rank}
            youAreHere={data.isOwner}
          />
        </section>

        {/* Top artists */}
        {data.topArtists.length > 0 && (
          <section
            className="flex flex-col gap-3"
            style={{ animation: `pq-fade-up 0.55s ${ease} 0.12s both` }}
          >
            <SectionHeading>
              {t("profile.public.topArtistsTitle")}
            </SectionHeading>
            <ul className="flex flex-col gap-2">
              {data.topArtists.map((a, i) => (
                <TopArtistRow
                  key={a.id}
                  artist={a}
                  barsLabel={t("profile.public.barsShort")}
                  style={{
                    animation: `pq-fade-up 0.4s ${ease} ${0.16 + i * 0.05}s both`,
                  }}
                />
              ))}
            </ul>
          </section>
        )}

        {/* Contributor stats (only when the user has submitted at least one bar) */}
        {data.contributor.submitted > 0 && (
          <ContributorSection contributor={data.contributor} />
        )}

        {/* Sparkline */}
        <section
          className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-5"
          style={{ animation: `pq-fade-up 0.55s ${ease} 0.16s both` }}
        >
          <SectionHeading>{t("profile.sparklineTitle")}</SectionHeading>
          <Sparkline
            data={profile.last30Days}
            label={t("profile.sparklineAria")}
          />
        </section>

        {/* Recent */}
        {profile.recent.length > 0 && (
          <section
            className="flex flex-col gap-3"
            style={{ animation: `pq-fade-up 0.55s ${ease} 0.24s both` }}
          >
            <SectionHeading>{t("profile.recentTitle")}</SectionHeading>
            <ul className="flex flex-col gap-2">
              {profile.recent.map((r, i) => (
                <li
                  key={r.punchlineId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/30 px-4 py-3 transition-colors duration-200 hover:border-primary/25 hover:bg-card/50"
                  style={{
                    animation: `pq-fade-up 0.4s ${ease} ${0.28 + i * 0.04}s both`,
                  }}
                >
                  <span className="line-clamp-2 text-sm font-semibold text-foreground/90">
                    "{r.line.split("/")[0].trim()}"
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary tabular-nums">
                    +{r.xpAwarded}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.isOwner && <InviteCard handle={data.handle} />}
        {data.isOwner && <MySubmissions />}
      </main>
    </div>
  )
}

/** Owner-only: highlighted invite card — shareable link, referral count, confirmed list + payoff (PUN-74/75). */
function InviteCard({ handle }: { handle: string }) {
  const { t } = useTranslation()
  const [data, setData] = useState<MyReferralsResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [celebrated, setCelebrated] = useState<
    Array<{ handle: string; xp: number }>
  >([])
  const [confettiKey, setConfettiKey] = useState(0)

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/i/${handle}`
      : `/i/${handle}`

  useEffect(() => {
    getMyReferralsFn()
      .then((d) => {
        setData(d)
        if (d.newlyConfirmed.length > 0) {
          setCelebrated(d.newlyConfirmed)
          setConfettiKey((k) => k + 1)
          logEvent("referral_confirmation_seen", {
            count: d.newlyConfirmed.length,
          })
          markReferralsSeenFn().catch(() => {})
        }
      })
      .catch(() =>
        setData({ confirmed: 0, pending: 0, items: [], newlyConfirmed: [] })
      )
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      logEvent("referral_link_copied", {})
    } catch {
      /* clipboard blocked */
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url: link, text: t("invite.shareText") })
        logEvent("referral_link_shared", { channel: "native" })
      } catch {
        /* user dismissed */
      }
    } else {
      copy()
    }
  }

  // Reserve the card's footprint while referrals load so the page below doesn't jump.
  if (data === null)
    return <SectionSkeleton className="h-52 border-primary/30 bg-primary/5" />
  const celebratedXp = celebrated.reduce((a, c) => a + c.xp, 0)

  return (
    <section
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-primary/40 bg-primary/5 p-5"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.28s both` }}
    >
      <Confetti trigger={confettiKey} />
      <SectionHeading
        action={
          data.confirmed > 0 ? (
            <span className="text-xs font-bold text-primary">
              {t("invite.count", { count: data.confirmed })}
            </span>
          ) : undefined
        }
      >
        {t("invite.cardTitle")}
      </SectionHeading>

      {celebrated.length > 0 && (
        <p className="text-sm font-extrabold text-primary">
          {celebrated.length === 1
            ? t("invite.payoffOne", { handle: celebrated[0].handle })
            : t("invite.payoffMany", { count: celebrated.length })}
          {celebratedXp > 0 && (
            <span className="text-foreground"> +{celebratedXp} XP</span>
          )}
        </p>
      )}

      <p className="text-sm text-balance text-muted-foreground">
        {t("invite.cardSubtitle")}
      </p>

      <div className="flex min-h-12 items-center gap-2 rounded-full border border-border/60 bg-background/60 py-1 pr-1 pl-4">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground/90">
          {link.replace(/^https?:\/\//, "")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copy}
          className="min-h-10 shrink-0 rounded-full px-4 text-xs font-bold tracking-wide text-primary uppercase hover:bg-primary/10 hover:text-primary"
        >
          {copied ? t("common.linkCopied") : t("invite.copy")}
        </Button>
      </div>

      <Button onClick={share} className="cta-glow min-h-11 text-sm font-bold">
        {t("invite.share")}
      </Button>

      {data.items.length > 0 && (
        <ul className="flex flex-col gap-0.5 pt-1">
          {data.items.slice(0, 5).map((r, i) => (
            <li
              key={`${r.handle}-${i}`}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <Link
                to="/u/$handle"
                params={{ handle: r.handle }}
                className="-mx-2 inline-flex min-h-9 flex-1 items-center rounded-lg px-2 font-semibold text-foreground/90 transition-colors hover:bg-primary/5 hover:text-primary"
              >
                @{r.handle}
              </Link>
              {r.xp > 0 && (
                <span className="shrink-0 text-xs font-bold text-primary tabular-nums">
                  +{r.xp} XP
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Owner-only: status of the user's UGC submissions (PUN-16). */
function MySubmissions() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Array<MySubmission> | null>(null)
  const [celebrated, setCelebrated] = useState<Array<MySubmission>>([])
  const [confettiKey, setConfettiKey] = useState(0)

  useEffect(() => {
    logEvent("submissions_viewed", {})
    getMySubmissionsFn()
      .then((list) => {
        setItems(list)
        // PUN-70 in-app pull payoff: celebrate any approved-but-unseen bars, then
        // mark them seen so the celebration fires exactly once.
        const fresh = list.filter((s) => s.newlyAccepted)
        if (fresh.length > 0) {
          setCelebrated(fresh)
          setConfettiKey((k) => k + 1)
          const xp = fresh.reduce((a, s) => a + (s.xpAwarded ?? 0), 0)
          logEvent("acceptance_seen", { count: fresh.length, xp })
          markAcceptanceSeenFn().catch(() => {})
        }
      })
      .catch(() => setItems([]))
  }, [])

  if (items === null) return <SectionSkeleton className="h-32" />
  return (
    <section
      className="flex flex-col gap-3"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.3s both` }}
    >
      {celebrated.length > 0 && (
        <AcceptanceCelebration items={celebrated} confettiKey={confettiKey} />
      )}
      <SectionHeading>{t("mySubmissions.title")}</SectionHeading>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("mySubmissions.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/30 px-4 py-3 transition-colors duration-200 hover:border-primary/25 hover:bg-card/50"
              style={{
                animation: `pq-fade-up 0.4s ${ease} ${0.32 + i * 0.04}s both`,
              }}
            >
              <span className="line-clamp-1 min-w-0 flex-1 text-sm font-semibold text-foreground/90">
                "{s.line.split("/")[0].trim()}"
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <SubmissionStatus status={s.status} />
                {s.status === "approved" && s.artistSlug && (
                  <Link
                    to="/play"
                    search={{ artist: s.artistSlug }}
                    className="-my-1 inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-bold text-primary transition-colors hover:bg-primary/10"
                  >
                    {t("mySubmissions.play")}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The "dein Bar ist live! +XP" celebration for newly-accepted submissions (PUN-70). */
function AcceptanceCelebration({
  items,
  confettiKey,
}: {
  items: Array<MySubmission>
  confettiKey: number
}) {
  const { t } = useTranslation()
  const xp = items.reduce((a, s) => a + (s.xpAwarded ?? 0), 0)
  const playable = items.find((s) => s.artistSlug)
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-primary/50 bg-primary/10 p-5 text-center"
      style={{ animation: `pq-fade-up 0.5s ${ease} both` }}
    >
      <Confetti trigger={confettiKey} />
      <p className="text-lg font-extrabold tracking-tight text-primary">
        {items.length === 1
          ? t("mySubmissions.celebrateOne")
          : t("mySubmissions.celebrateMany", { count: items.length })}
      </p>
      {xp > 0 && (
        <p className="mt-1 text-2xl font-extrabold text-foreground tabular-nums">
          +{xp.toLocaleString()} XP
        </p>
      )}
      {playable?.artistSlug && (
        <Button
          className="mt-3 text-sm font-bold"
          render={<Link to="/play" search={{ artist: playable.artistSlug }} />}
        >
          {t("mySubmissions.playLive")}
        </Button>
      )}
    </div>
  )
}

function SubmissionStatus({ status }: { status: string }) {
  const { t } = useTranslation()
  const map: Record<string, { label: string; cls: string }> = {
    pending: {
      label: t("mySubmissions.pending"),
      cls: "bg-muted/60 text-muted-foreground",
    },
    approved: {
      label: t("mySubmissions.approved"),
      cls: "bg-primary/15 text-primary",
    },
    rejected: {
      label: t("mySubmissions.rejected"),
      cls: "bg-destructive/15 text-destructive",
    },
  }
  const s = map[status] ?? map.pending
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase",
        s.cls
      )}
    >
      {s.label}
    </span>
  )
}

function Actions({
  data,
  onFollowersChange,
}: {
  data: Extract<PublicProfileResult, { found: true }>
  onFollowersChange: (n: number) => void
}) {
  const { t } = useTranslation()
  const { isSignedIn } = useAuth()
  const [following, setFollowing] = useState(data.isFollowing)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // Owner view: share own profile + (Phase 3) create challenge.
  if (data.isOwner) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Button
          variant="ghost"
          className="min-h-11 border border-border/60 px-5 text-sm font-bold"
          onClick={async () => {
            const url = `${window.location.origin}/u/${data.handle}`
            try {
              if (navigator.share) await navigator.share({ url })
              else {
                await navigator.clipboard.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }
            } catch {
              /* user dismissed share sheet */
            }
          }}
        >
          {copied ? t("common.linkCopied") : t("profile.public.shareProfile")}
        </Button>
        <CreateChallengeButton
          label={t("profile.public.createChallenge")}
          signedIn
        />
      </div>
    )
  }

  async function toggle() {
    if (busy) return
    setBusy(true)
    try {
      const res = following
        ? await unfollowByHandleFn({ data: { handle: data.handle } })
        : await followByHandleFn({ data: { handle: data.handle } })
      setFollowing(res.isFollowing)
      onFollowersChange(res.followerCount)
      logEvent(res.isFollowing ? "user_followed" : "user_unfollowed", {
        handle: data.handle,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
      {isSignedIn ? (
        <Button
          onClick={toggle}
          disabled={busy}
          variant={following ? "ghost" : "default"}
          className={cn(
            "min-h-11 px-6 text-sm font-bold",
            following
              ? "border border-primary/50 text-primary hover:bg-primary/10"
              : "cta-glow bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {following
            ? t("profile.public.followingBtn")
            : t("profile.public.follow")}
        </Button>
      ) : (
        <SignUpButton mode="modal">
          <Button className="cta-glow min-h-11 bg-primary px-6 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            {t("profile.public.follow")}
          </Button>
        </SignUpButton>
      )}
      <CreateChallengeButton
        label={t("profile.public.challenge")}
        signedIn={isSignedIn === true}
      />
    </div>
  )
}

/** Creates a fresh 5-bar challenge and routes to it. Auth-required to create. */
function CreateChallengeButton({
  label,
  signedIn,
}: {
  label: string
  signedIn: boolean
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function create() {
    if (busy) return
    setBusy(true)
    try {
      const { slug } = await createChallengeFn()
      logEvent("challenge_created", { slug })
      navigate({ to: "/c/$slug", params: { slug } })
    } catch (e) {
      console.error(e)
      setBusy(false)
    }
  }

  if (!signedIn) {
    return (
      <SignUpButton mode="modal">
        <Button
          variant="ghost"
          className="min-h-11 border border-primary/50 px-5 text-sm font-bold text-primary hover:bg-primary/10"
        >
          {label}
        </Button>
      </SignUpButton>
    )
  }
  return (
    <Button
      onClick={create}
      disabled={busy}
      variant="ghost"
      className="min-h-11 border border-primary/50 px-5 text-sm font-bold text-primary hover:bg-primary/10"
    >
      {busy ? "…" : label}
    </Button>
  )
}

/** Shared section label: a small gold tick + uppercase title, with an optional
 *  trailing action. Gives every section the same rhythm and a hierarchy anchor. */
function SectionHeading({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-5 items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-primary/80 uppercase">
        <span
          aria-hidden="true"
          className="h-3 w-0.5 rounded-full bg-primary/50"
        />
        {children}
      </h2>
      {action}
    </div>
  )
}

/** Holds a section's footprint while async owner content loads — no layout jump. */
function SectionSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-2xl border border-border/40 bg-card/30",
        className
      )}
    />
  )
}

function Avatar({
  imageUrl,
  handle,
}: {
  imageUrl: string | null
  handle: string
}) {
  const initial = handle.slice(0, 1).toUpperCase()
  return (
    <div
      className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/60 bg-card transition-transform duration-300 hover:scale-[1.03]"
      style={{
        animation: `pq-pop-in 0.55s ${ease} 0.05s both`,
        boxShadow:
          "0 0 36px color-mix(in oklch, var(--primary), transparent 60%)",
      }}
      aria-hidden="true"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-4xl font-extrabold text-primary">{initial}</span>
      )}
    </div>
  )
}

function Count({
  value,
  label,
  bumpKey = 0,
}: {
  value: number
  label: string
  bumpKey?: number
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        key={bumpKey}
        className="text-base font-extrabold text-foreground tabular-nums"
        style={bumpKey > 0 ? { animation: `pq-pulse 0.4s ${ease}` } : undefined}
      >
        {value}
      </span>
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
    </span>
  )
}

function TopArtistRow({
  artist,
  barsLabel,
  style,
}: {
  artist: TopArtist
  barsLabel: string
  style?: CSSProperties
}) {
  const initials = artist.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <li
      className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/30 px-3 py-2.5 transition-colors duration-200 hover:border-primary/25 hover:bg-card/50"
      style={style}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/60"
        aria-hidden="true"
      >
        {artist.imageUrl ? (
          <img
            src={artist.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            width={36}
            height={36}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[0.7em] font-bold text-foreground/70">
            {initials}
          </span>
        )}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-foreground">
        {artist.name}
      </span>
      <span className="shrink-0 text-sm font-extrabold text-primary tabular-nums">
        {artist.solved}
        <span className="ml-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {barsLabel}
        </span>
      </span>
    </li>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  const frac = Math.max(0, Math.min(1, pct / 100))
  return (
    <div className="relative h-2 w-full max-w-xs overflow-hidden rounded-full bg-primary/15">
      {/* GPU fill: scaleX from the left edge (no layout), revealed on mount. */}
      <div
        className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-primary/80 to-primary"
        style={{
          transform: `scaleX(${frac})`,
          animation: `pq-grow-x 0.8s ${ease} 0.15s both`,
          boxShadow:
            "0 0 16px color-mix(in oklch, var(--primary), transparent 50%)",
        }}
      />
      {/* One-shot gold sheen sweeping across the filled bar. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"
        style={{ animation: `pq-banner-sheen 1.1s ${ease} 0.6s both` }}
      />
    </div>
  )
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-border/40 bg-card/30 px-3 py-4 transition-colors duration-200 hover:border-primary/20 hover:bg-card/50">
      <span
        className={cn(
          "text-2xl font-extrabold tabular-nums",
          accent ? "text-primary" : "text-foreground"
        )}
        style={
          accent
            ? {
                textShadow:
                  "0 0 18px color-mix(in oklch, var(--primary), transparent 55%)",
              }
            : undefined
        }
      >
        {value}
      </span>
      <span className="text-center text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  )
}

/** Contributor stats block + tier prestige chip (PUN-68). */
function ContributorSection({
  contributor,
}: {
  contributor: ContributorProfile
}) {
  const { t } = useTranslation()
  const ratePct =
    contributor.resolved > 0 ? Math.round(contributor.acceptanceRate * 100) : 0
  return (
    <section
      className="flex flex-col gap-3"
      style={{ animation: `pq-fade-up 0.55s ${ease} 0.14s both` }}
    >
      <SectionHeading action={<TierChip tier={contributor.tier} />}>
        {t("profile.contributor.title")}
      </SectionHeading>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={t("profile.contributor.accepted")}
          value={contributor.accepted}
          accent={contributor.accepted > 0}
        />
        <StatTile
          label={t("profile.contributor.submitted")}
          value={contributor.submitted}
        />
        <StatTile label={t("profile.contributor.rate")} value={ratePct} />
        <StatTile
          label={t("profile.contributor.streak")}
          value={contributor.streak}
          accent={contributor.streak > 0}
        />
      </div>
      {contributor.nextTier && (
        <p className="text-center text-xs font-semibold text-muted-foreground">
          {t("profile.contributor.nextTier", {
            count: contributor.nextTier.acceptedNeeded,
            tier: t(
              `profile.contributor.tier.${contributor.nextTier.nextTier}`
            ),
          })}
        </p>
      )}
    </section>
  )
}

function TierChip({ tier }: { tier: ContributorTier }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-primary uppercase">
      {t(`profile.contributor.tier.${tier}`)}
    </span>
  )
}

function Sparkline({
  data,
  label,
}: {
  data: Array<{ date: string; xp: number }>
  label: string
}) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.xp)), [data])
  return (
    <div
      className="flex h-20 items-end gap-[3px]"
      role="img"
      aria-label={label}
    >
      {data.map((d, i) => {
        const h = (d.xp / max) * 100
        const hasXp = d.xp > 0
        return (
          <div
            key={d.date}
            className="relative flex-1 self-stretch overflow-hidden rounded-sm"
            aria-hidden="true"
          >
            {/* GPU grow: scaleY from the bottom, staggered left→right. Height % sets
                the target; the animation only reveals the bar from a flat baseline. */}
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 origin-bottom rounded-sm",
                hasXp ? "bg-primary/80" : "bg-primary/10"
              )}
              style={{
                height: hasXp ? `${Math.max(6, h)}%` : "6%",
                animation: `pq-grow-up 0.5s ${ease} ${i * 0.012}s both`,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
