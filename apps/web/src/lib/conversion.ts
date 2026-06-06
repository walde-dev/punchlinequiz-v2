import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { sql } from "drizzle-orm"

import { db } from "./db"
import { requireAdmin } from "./auth"

/**
 * Launch conversion analytics (PUN-118/119/121/122), computed live over the
 * `game_events` log — the adblock-proof source of truth we trust over PostHog.
 *
 * Everything excludes internal/admin sessions (`props.internal === true`). The
 * core funnel is session-based (distinct anon session_id); share/render/referral
 * counts are event-based. acq_source (PUN-121) buckets sessions by first-touch
 * channel; sessions before that shipped read as "unknown".
 */

export type DateRange = { from?: string | null; to?: string | null }

export type FunnelStage = { key: string; label: string; count: number }
export type SourceRow = {
  source: string
  sessions: number
  signups: number
  signupRate: number | null
}
export type TsPoint = { bucket: string; sessions: number; signups: number; shares: number }

export type ConversionMetrics = {
  sessions: number
  shown: number
  clicked: number
  signups: number
  completed: number
  shareClicks: number
  shareCompleted: number
  shareDismissed: number
  renderOk: number
  renderFail: number
  refLandings: number
  avgRounds: number
  reached5: number
  rates: {
    shownToClicked: number | null
    signupRate: number | null
    signupOfShown: number | null
    clickToSignup: number | null
    shareRate: number | null
    renderFailRate: number | null
    pct5plus: number | null
  }
  signupFunnel: Array<FunnelStage>
  shareFunnel: Array<FunnelStage>
  bySource: Array<SourceRow>
  timeseries: Array<TsPoint>
}

async function rawRows<T>(query: ReturnType<typeof sql>): Promise<Array<T>> {
  const res = (await db.execute(query)) as unknown as { rows?: Array<T> } | Array<T>
  return Array.isArray(res) ? res : (res.rows ?? [])
}

const rate = (n: number, d: number): number | null => (d > 0 ? n / d : null)

export const getConversionMetricsFn = createServerFn({ method: "GET" })
  .inputValidator((d: DateRange) => ({
    from: typeof d.from === "string" ? d.from : null,
    to: typeof d.to === "string" ? d.to : null,
  }))
  .handler(async ({ data }): Promise<ConversionMetrics> => {
    await requireAdmin(getRequest())

    const from = data.from ? sql`and created_at >= ${`${data.from}T00:00:00.000Z`}` : sql``
    const to = data.to ? sql`and created_at <= ${`${data.to}T23:59:59.999Z`}` : sql``
    // Shared filter: drop admin/QA sessions, bound the window.
    const where = sql`where (props->>'internal') is distinct from 'true' ${from} ${to}`

    // Per-session rollup → funnel + engagement + source.
    const [agg] = await rawRows<{
      sessions: number
      shown: number
      clicked: number
      signups: number
      completed: number
      avg_rounds: number | null
      reached5: number
    }>(sql`
      with sess as (
        select session_id,
          max((name='signup_prompt_shown')::int)  as shown,
          max((name='signup_prompt_clicked')::int) as clicked,
          max((name='handle_claimed')::int)        as signed,
          max((name='session_completed')::int)     as completed,
          count(*) filter (where name='round_started') as rounds
        from game_events ${where}
        group by session_id
      )
      select
        count(*)::int as sessions,
        coalesce(sum(shown),0)::int as shown,
        coalesce(sum(clicked),0)::int as clicked,
        coalesce(sum(signed),0)::int as signups,
        coalesce(sum(completed),0)::int as completed,
        round(avg(rounds),2) as avg_rounds,
        count(*) filter (where rounds>=5)::int as reached5
      from sess
    `)

    // Event-level counts: shares, render health, referral landings.
    const [ev] = await rawRows<{
      share_clicks: number
      share_done: number
      share_dismiss: number
      render_ok: number
      render_fail: number
      ref_lands: number
    }>(sql`
      select
        count(*) filter (where name='share_clicked')::int as share_clicks,
        count(*) filter (where name='share_completed')::int as share_done,
        count(*) filter (where name='share_dismissed')::int as share_dismiss,
        count(*) filter (where name='card_render_succeeded')::int as render_ok,
        count(*) filter (where name='card_render_failed')::int as render_fail,
        count(*) filter (where name='referral_landing_viewed')::int as ref_lands
      from game_events ${where}
    `)

    // Sessions + signups by acquisition channel (PUN-121).
    const sourceRows = await rawRows<{ source: string; sessions: number; signups: number }>(sql`
      with sess as (
        select session_id,
          max((name='handle_claimed')::int) as signed,
          (array_agg(props->>'acq_source') filter (where props->>'acq_source' is not null))[1] as acq_source
        from game_events ${where}
        group by session_id
      )
      select coalesce(acq_source,'unknown') as source,
        count(*)::int as sessions,
        coalesce(sum(signed),0)::int as signups
      from sess group by 1 order by sessions desc
    `)

    // Hourly timeseries.
    const tsRows = await rawRows<{
      bucket: string
      sessions: number
      signups: number
      shares: number
    }>(sql`
      select to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24:00') as bucket,
        count(distinct session_id)::int as sessions,
        count(*) filter (where name='handle_claimed')::int as signups,
        count(*) filter (where name='share_clicked')::int as shares
      from game_events ${where}
      group by 1 order by 1
    `)

    const sessions = Number(agg?.sessions ?? 0)
    const shown = Number(agg?.shown ?? 0)
    const clicked = Number(agg?.clicked ?? 0)
    const signups = Number(agg?.signups ?? 0)
    const completed = Number(agg?.completed ?? 0)
    const reached5 = Number(agg?.reached5 ?? 0)
    const shareClicks = Number(ev?.share_clicks ?? 0)
    const shareCompleted = Number(ev?.share_done ?? 0)
    const renderOk = Number(ev?.render_ok ?? 0)
    const renderFail = Number(ev?.render_fail ?? 0)

    return {
      sessions,
      shown,
      clicked,
      signups,
      completed,
      shareClicks,
      shareCompleted,
      shareDismissed: Number(ev?.share_dismiss ?? 0),
      renderOk,
      renderFail,
      refLandings: Number(ev?.ref_lands ?? 0),
      avgRounds: Number(agg?.avg_rounds ?? 0),
      reached5,
      rates: {
        shownToClicked: rate(clicked, shown),
        signupRate: rate(signups, sessions),
        signupOfShown: rate(signups, shown),
        clickToSignup: rate(signups, clicked),
        shareRate: rate(shareClicks, completed),
        renderFailRate: rate(renderFail, renderOk + renderFail),
        pct5plus: rate(reached5, sessions),
      },
      signupFunnel: [
        { key: "sessions", label: "Sessions", count: sessions },
        { key: "shown", label: "Prompt shown", count: shown },
        { key: "clicked", label: "Clicked", count: clicked },
        { key: "signups", label: "Signed up", count: signups },
      ],
      shareFunnel: [
        { key: "completed", label: "Sessions completed", count: completed },
        { key: "share_clicks", label: "Share tapped", count: shareClicks },
        { key: "share_done", label: "Share completed", count: shareCompleted },
      ],
      bySource: sourceRows.map((r) => ({
        source: r.source,
        sessions: Number(r.sessions),
        signups: Number(r.signups),
        signupRate: rate(Number(r.signups), Number(r.sessions)),
      })),
      timeseries: tsRows.map((r) => ({
        bucket: r.bucket,
        sessions: Number(r.sessions),
        signups: Number(r.signups),
        shares: Number(r.shares),
      })),
    }
  })
