"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Drop-off from the previous step, expressed as 0..1 of *that* step's count. */
  dropoff: number;
};

export type CoachCalCtaRow = {
  /** Stable surface id matching the `target` field on the underlying
   *  ui_events rows (e.g. "playbook_floating_card",
   *  "header_promo_popover"). */
  surface: string;
  impressions: number;
  clicks: number;
  dismisses: number;
  /** Impressions that produced neither a click nor an explicit dismiss
   *  in the same window. People who saw it and walked away. */
  walkAways: number;
  uniqueImpressionUsers: number;
  /** clicks / impressions, 0..1. */
  clickRate: number;
  /** dismisses / impressions, 0..1. */
  dismissRate: number;
};

export type DeviceCohortMetrics = {
  sessions: number;
  views: number;
  viewsPerSession: number;
  /** Fraction of sessions with exactly one page_view (0..1). */
  bounceRate: number;
  /** Sessions whose first or any view hit a viewer surface (playbook,
   *  play, share/copy token, examples). Bounce rate below is computed
   *  over this subset. */
  viewerSessions: number;
  viewerBounceRate: number;
  /** Mean dwell across viewer-surface views with a recorded dwell, in ms. */
  viewerAvgDwellMs: number | null;
};

export type MobileEngagementSummary = {
  windowDays: number;
  /** ISO timestamp at which the current window begins. */
  windowStart: string;
  /** ISO timestamp at which the prior window begins. */
  priorWindowStart: string;
  /** Mobile = device in {mobile, tablet}. Desktop = device == "desktop"
   *  (unknown/null devices are excluded from both cohorts to avoid noise). */
  current: {
    mobile: DeviceCohortMetrics;
    desktop: DeviceCohortMetrics;
  };
  prior: {
    mobile: DeviceCohortMetrics;
    desktop: DeviceCohortMetrics;
  };
};

export type EngagementSummary = {
  windowDays: number;
  funnel: FunnelStep[];
  topExits: Array<{ path: string; exits: number; avgDwellMs: number | null }>;
  longestDwell: Array<{ path: string; avgDwellMs: number; samples: number }>;
  shortestDwell: Array<{ path: string; avgDwellMs: number; samples: number }>;
  topEvents: Array<{ event: string; count: number; uniqueUsers: number }>;
  totalEvents: number;
  coachCalCtas: CoachCalCtaRow[];
  mobileEngagement: MobileEngagementSummary;
};

export type ViralitySummary = {
  windowDays: number;
  shares: {
    total: number;
    byKind: Array<{ kind: string; count: number }>;
    inboundVisits: number;
    inboundSessions: number;
    inboundSignups: number;
    inboundConversion: number;
  };
  /** K-factor proxy: shares per active sharer × signup rate per inbound visit. */
  kFactor: number;
  topSharers: Array<{
    userId: string;
    displayName: string | null;
    shares: number;
    inboundVisits: number;
    inboundSignups: number;
  }>;
  recentShares: Array<{
    id: number;
    createdAt: string;
    actorName: string | null;
    kind: string;
    channel: string | null;
    inboundVisits: number;
  }>;
};

type EOk<T> = { ok: true; summary: T };
type Err = { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return { ok: false, error: "Forbidden." };
  return { ok: true };
}

function emptyDeviceCohort(): DeviceCohortMetrics {
  return {
    sessions: 0,
    views: 0,
    viewsPerSession: 0,
    bounceRate: 0,
    viewerSessions: 0,
    viewerBounceRate: 0,
    viewerAvgDwellMs: null,
  };
}

function emptyMobileEngagement(windowDays: number): MobileEngagementSummary {
  const now = Date.now();
  const ws = new Date(now - windowDays * 86400 * 1000).toISOString();
  const ps = new Date(now - 2 * windowDays * 86400 * 1000).toISOString();
  return {
    windowDays,
    windowStart: ws,
    priorWindowStart: ps,
    current: { mobile: emptyDeviceCohort(), desktop: emptyDeviceCohort() },
    prior: { mobile: emptyDeviceCohort(), desktop: emptyDeviceCohort() },
  };
}

function emptyEngagement(windowDays: number): EngagementSummary {
  return {
    windowDays,
    funnel: [],
    topExits: [],
    longestDwell: [],
    shortestDwell: [],
    topEvents: [],
    totalEvents: 0,
    coachCalCtas: [],
    mobileEngagement: emptyMobileEngagement(windowDays),
  };
}

/** True for paths that put a coach in front of *content* — playbook
 *  pages, single-play pages, share/copy token landings, the examples
 *  index, and the mobile play viewer. These are the surfaces the
 *  mobile-UX work targeted; bounce rate here is the headline metric
 *  for "did the changes help viewers actually browse." */
function isViewerPath(path: string): boolean {
  if (!path) return false;
  if (path.startsWith("/playbooks/")) return true;
  if (path.startsWith("/plays/")) return true;
  if (path.startsWith("/v/")) return true;
  if (path.startsWith("/m/play")) return true;
  if (path.startsWith("/copy/")) return true;
  if (path === "/examples" || path.startsWith("/examples/")) return true;
  return false;
}

type DeviceClass = "mobile" | "desktop" | null;
function classifyDevice(d: string | null | undefined): DeviceClass {
  if (d === "mobile" || d === "tablet") return "mobile";
  if (d === "desktop") return "desktop";
  return null;
}

type ViewLite = {
  session_id: string;
  path: string;
  device: string | null;
  dwell_ms: number | null;
  user_id: string | null;
  created_at: string;
};

function computeDeviceCohort(views: ViewLite[]): {
  mobile: DeviceCohortMetrics;
  desktop: DeviceCohortMetrics;
} {
  // Each session is one device class — we resolve by majority vote of
  // its rows (typically every row agrees, but handle the rare flip).
  const sessionDevice = new Map<string, { mobile: number; desktop: number }>();
  for (const v of views) {
    const cls = classifyDevice(v.device);
    if (!cls) continue;
    const slot = sessionDevice.get(v.session_id) ?? { mobile: 0, desktop: 0 };
    slot[cls] += 1;
    sessionDevice.set(v.session_id, slot);
  }
  const sessionClass = new Map<string, "mobile" | "desktop">();
  for (const [sid, c] of sessionDevice) {
    sessionClass.set(sid, c.mobile >= c.desktop ? "mobile" : "desktop");
  }

  type Acc = {
    sessions: Set<string>;
    views: number;
    viewerSessions: Set<string>;
    viewerDwellSum: number;
    viewerDwellN: number;
    sessionViewCounts: Map<string, number>;
    sessionViewerViewCounts: Map<string, number>;
  };
  function emptyAcc(): Acc {
    return {
      sessions: new Set(),
      views: 0,
      viewerSessions: new Set(),
      viewerDwellSum: 0,
      viewerDwellN: 0,
      sessionViewCounts: new Map(),
      sessionViewerViewCounts: new Map(),
    };
  }
  const accs = { mobile: emptyAcc(), desktop: emptyAcc() };

  for (const v of views) {
    const cls = sessionClass.get(v.session_id);
    if (!cls) continue;
    const a = accs[cls];
    a.sessions.add(v.session_id);
    a.views += 1;
    a.sessionViewCounts.set(
      v.session_id,
      (a.sessionViewCounts.get(v.session_id) ?? 0) + 1,
    );
    if (isViewerPath(v.path)) {
      a.viewerSessions.add(v.session_id);
      a.sessionViewerViewCounts.set(
        v.session_id,
        (a.sessionViewerViewCounts.get(v.session_id) ?? 0) + 1,
      );
      if (typeof v.dwell_ms === "number" && v.dwell_ms > 0) {
        a.viewerDwellSum += v.dwell_ms;
        a.viewerDwellN += 1;
      }
    }
  }

  function finalize(a: Acc): DeviceCohortMetrics {
    const sessions = a.sessions.size;
    let bounced = 0;
    for (const c of a.sessionViewCounts.values()) if (c <= 1) bounced += 1;
    let viewerBounced = 0;
    for (const c of a.sessionViewerViewCounts.values()) if (c <= 1) viewerBounced += 1;
    return {
      sessions,
      views: a.views,
      viewsPerSession: sessions > 0 ? +(a.views / sessions).toFixed(2) : 0,
      bounceRate: sessions > 0 ? bounced / sessions : 0,
      viewerSessions: a.viewerSessions.size,
      viewerBounceRate:
        a.viewerSessions.size > 0 ? viewerBounced / a.viewerSessions.size : 0,
      viewerAvgDwellMs: a.viewerDwellN > 0 ? Math.round(a.viewerDwellSum / a.viewerDwellN) : null,
    };
  }

  return { mobile: finalize(accs.mobile), desktop: finalize(accs.desktop) };
}

function emptyVirality(windowDays: number): ViralitySummary {
  return {
    windowDays,
    shares: {
      total: 0,
      byKind: [],
      inboundVisits: 0,
      inboundSessions: 0,
      inboundSignups: 0,
      inboundConversion: 0,
    },
    kFactor: 0,
    topSharers: [],
    recentShares: [],
  };
}

export async function getEngagementSummaryAction(
  windowDays: number = 30,
): Promise<EOk<EngagementSummary> | Err> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const days = Math.max(1, Math.min(365, Math.floor(windowDays)));
  const admin = createServiceRoleClient();
  const now = Date.now();
  const windowStartMs = now - days * 24 * 60 * 60 * 1000;
  const priorWindowStartMs = now - 2 * days * 24 * 60 * 60 * 1000;
  const windowStart = new Date(windowStartMs).toISOString();
  const priorWindowStart = new Date(priorWindowStartMs).toISOString();

  try {
    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1000);
    const adminIds = new Set<string>((adminProfiles ?? []).map((p) => p.id as string));

    // Page views (for funnel + exits + dwell + mobile cohort).
    // Pull 2× window so the prior period is in scope for comparison.
    const { data: pvRaw } = await admin
      .from("page_views")
      .select("session_id, user_id, path, device, dwell_ms, is_exit, created_at")
      .eq("is_bot", false)
      .gte("created_at", priorWindowStart)
      .limit(200000);
    const pvAll = (pvRaw ?? []) as Array<{
      session_id: string;
      user_id: string | null;
      path: string;
      device: string | null;
      dwell_ms: number | null;
      is_exit: boolean | null;
      created_at: string;
    }>;

    const adminSessionIds = new Set<string>();
    for (const v of pvAll) {
      if (v.user_id && adminIds.has(v.user_id)) adminSessionIds.add(v.session_id);
    }
    const allViews = pvAll.filter((v) => !adminSessionIds.has(v.session_id));
    // Split current vs prior. The funnel/exits/dwell calcs below should
    // only see the current window — historical behavior is preserved.
    const views: typeof allViews = [];
    const priorViews: typeof allViews = [];
    for (const v of allViews) {
      const t = new Date(v.created_at).getTime();
      if (t >= windowStartMs) views.push(v);
      else if (t >= priorWindowStartMs) priorViews.push(v);
    }

    const sessions = new Set(views.map((v) => v.session_id));
    const usersWithView = new Set(
      views.map((v) => v.user_id).filter((u): u is string => !!u && !adminIds.has(u)),
    );

    // New signups in window for funnel.
    const { data: profilesRaw } = await admin
      .from("profiles")
      .select("id, created_at, role")
      .gte("created_at", windowStart)
      .limit(100000);
    const newSignups = (profilesRaw ?? []).filter(
      (p) => (p.role as string) !== "admin",
    );
    const newSignupIds = new Set(newSignups.map((p) => p.id as string));

    // First-play signal: any play_version saved in window whose creator
    // is a new signup. plays itself doesn't carry created_by — version
    // rows are the authoritative authorship record (one is written for
    // every save, including the initial create).
    const { data: playVersionsRaw, error: playVersionsErr } = await admin
      .from("play_versions")
      .select("created_by")
      .gte("created_at", windowStart)
      .limit(200000);
    if (playVersionsErr) throw new Error(playVersionsErr.message);
    const firstPlayUsers = new Set<string>();
    for (const v of playVersionsRaw ?? []) {
      const uid = v.created_by as string | null;
      if (uid && newSignupIds.has(uid)) firstPlayUsers.add(uid);
    }

    // First-share signal: any share_event in window by a new signup.
    const { data: sharesRaw } = await admin
      .from("share_events")
      .select("actor_user_id")
      .gte("created_at", windowStart)
      .limit(100000);
    const firstShareUsers = new Set<string>();
    for (const s of sharesRaw ?? []) {
      const uid = s.actor_user_id as string | null;
      if (uid && newSignupIds.has(uid)) firstShareUsers.add(uid);
    }

    // Paid-intent signal: any /pricing view by a new signup. We session-
    // stitch so an anonymous /pricing view that *later* authenticates as
    // a new signup counts too — coaches typically scan pricing before
    // they create the account, and we'd undercount intent if we only
    // looked at authed views.
    const sessionToNewUserId = new Map<string, string>();
    for (const v of views) {
      if (v.user_id && newSignupIds.has(v.user_id)) {
        sessionToNewUserId.set(v.session_id, v.user_id);
      }
    }
    const pricingViewUsers = new Set<string>();
    for (const v of views) {
      if (v.path !== "/pricing") continue;
      if (v.user_id && newSignupIds.has(v.user_id)) {
        pricingViewUsers.add(v.user_id);
        continue;
      }
      const stitchedUid = sessionToNewUserId.get(v.session_id);
      if (stitchedUid) pricingViewUsers.add(stitchedUid);
    }

    // Checkout-started / completed signals. Fired client-side from the
    // pricing page click handler (`checkout_started`) and from the
    // /account return-from-Stripe effect (`checkout_completed`). Same
    // session-stitching as pricing — anonymous events on a session that
    // later authenticates as a new signup still count.
    const { data: checkoutEvRaw } = await admin
      .from("ui_events")
      .select("event_name, user_id, session_id")
      .in("event_name", ["checkout_started", "checkout_completed"])
      .gte("created_at", windowStart)
      .limit(50000);
    const checkoutStartedUsers = new Set<string>();
    const checkoutCompletedUsers = new Set<string>();
    for (const e of (checkoutEvRaw ?? []) as Array<{
      event_name: string;
      user_id: string | null;
      session_id: string;
    }>) {
      const set =
        e.event_name === "checkout_started"
          ? checkoutStartedUsers
          : checkoutCompletedUsers;
      if (e.user_id && newSignupIds.has(e.user_id)) {
        set.add(e.user_id);
        continue;
      }
      const stitched = sessionToNewUserId.get(e.session_id);
      if (stitched) set.add(stitched);
    }

    const visitorCount = sessions.size;
    const signupCount = newSignups.length;
    const playCount = firstPlayUsers.size;
    const pricingViewCount = pricingViewUsers.size;
    const checkoutStartedCount = checkoutStartedUsers.size;
    const checkoutCompletedCount = checkoutCompletedUsers.size;
    const shareCount = firstShareUsers.size;

    function dropoff(prev: number, cur: number): number {
      if (!prev) return 0;
      return Math.max(0, 1 - cur / prev);
    }
    const funnel: FunnelStep[] = [
      { key: "visit", label: "Visited site", count: visitorCount, dropoff: 0 },
      {
        key: "signup",
        label: "Signed up",
        count: signupCount,
        dropoff: dropoff(visitorCount, signupCount),
      },
      // Pricing-view sits right after signup so the dropoff reads as
      // "% of signups that showed paid intent" — the headline number
      // for the upgrade funnel until conversions are large enough to
      // measure directly.
      {
        key: "viewed_pricing",
        label: "Viewed pricing",
        count: pricingViewCount,
        dropoff: dropoff(signupCount, pricingViewCount),
      },
      // Started checkout: clicked Subscribe on /pricing. Dropoff is
      // relative to pricing-viewers — this is the "% of pricing
      // viewers who actually clicked through" leak rate. The single
      // most actionable mid-funnel metric for diagnosing whether
      // /pricing copy / CTAs are converting.
      {
        key: "checkout_started",
        label: "Started checkout",
        count: checkoutStartedCount,
        dropoff: dropoff(pricingViewCount, checkoutStartedCount),
      },
      // Completed checkout: returned to /account?checkout=success
      // from Stripe. Dropoff is "% of starts that didn't make it
      // through the Stripe form" — payment-form abandonment rate.
      {
        key: "checkout_completed",
        label: "Completed checkout",
        count: checkoutCompletedCount,
        dropoff: dropoff(checkoutStartedCount, checkoutCompletedCount),
      },
      // Activation. Compared back to signup (not pricing/checkout)
      // because the play-create path doesn't require any of those
      // upgrade-flow steps — most coaches jump straight to the editor
      // before they ever consider paying.
      {
        key: "first_play",
        label: "Created first play",
        count: playCount,
        dropoff: dropoff(signupCount, playCount),
      },
      {
        key: "first_share",
        label: "Shared something",
        count: shareCount,
        dropoff: dropoff(playCount, shareCount),
      },
    ];

    // Top exit pages.
    const exitMap = new Map<string, { exits: number; dwellSum: number; dwellN: number }>();
    for (const v of views) {
      if (!v.is_exit) continue;
      const e = exitMap.get(v.path) ?? { exits: 0, dwellSum: 0, dwellN: 0 };
      e.exits += 1;
      if (typeof v.dwell_ms === "number" && v.dwell_ms > 0) {
        e.dwellSum += v.dwell_ms;
        e.dwellN += 1;
      }
      exitMap.set(v.path, e);
    }
    const topExits = Array.from(exitMap.entries())
      .map(([path, v]) => ({
        path,
        exits: v.exits,
        avgDwellMs: v.dwellN > 0 ? Math.round(v.dwellSum / v.dwellN) : null,
      }))
      .sort((a, b) => b.exits - a.exits)
      .slice(0, 10);

    // Avg dwell per path (any view with a dwell measurement).
    const dwellMap = new Map<string, { sum: number; n: number }>();
    for (const v of views) {
      if (typeof v.dwell_ms !== "number" || v.dwell_ms <= 0) continue;
      const e = dwellMap.get(v.path) ?? { sum: 0, n: 0 };
      e.sum += v.dwell_ms;
      e.n += 1;
      dwellMap.set(v.path, e);
    }
    const dwellPaths = Array.from(dwellMap.entries())
      .filter(([, v]) => v.n >= 3)
      .map(([path, v]) => ({
        path,
        avgDwellMs: Math.round(v.sum / v.n),
        samples: v.n,
      }));
    const longestDwell = [...dwellPaths]
      .sort((a, b) => b.avgDwellMs - a.avgDwellMs)
      .slice(0, 10);
    const shortestDwell = [...dwellPaths]
      .sort((a, b) => a.avgDwellMs - b.avgDwellMs)
      .slice(0, 10);

    // UI events. Pulled with `target` so the Coach Cal aggregator below
    // can split by surface without a second round-trip.
    const { data: evRaw } = await admin
      .from("ui_events")
      .select("event_name, user_id, session_id, target")
      .gte("created_at", windowStart)
      .limit(100000);
    const evRows = (evRaw ?? []).filter((e) => {
      const uid = e.user_id as string | null;
      return !uid || !adminIds.has(uid);
    });
    const evMap = new Map<string, { count: number; users: Set<string> }>();
    for (const e of evRows) {
      const name = e.event_name as string;
      const slot = evMap.get(name) ?? { count: 0, users: new Set<string>() };
      slot.count += 1;
      const uid = (e.user_id as string | null) ?? `anon:${e.session_id}`;
      slot.users.add(uid);
      evMap.set(name, slot);
    }
    const topEvents = Array.from(evMap.entries())
      .map(([event, v]) => ({ event, count: v.count, uniqueUsers: v.users.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // Coach Cal CTA aggregation, split by surface (target). Counts
    // impressions / clicks / dismisses and computes walk-aways =
    // impressions - clicks - dismisses (capped at 0). The same session
    // can fire multiple impressions if the user opens/closes the
    // header popover repeatedly; we count each shown view, not each
    // unique user, so the click/dismiss rates compare against the same
    // denominator the user actually saw.
    type CoachSlot = {
      impressions: number;
      clicks: number;
      dismisses: number;
      impressionUsers: Set<string>;
    };
    const COACH_EVENTS = new Set([
      "coach_cal_cta_impression",
      "coach_cal_cta_click",
      "coach_cal_cta_dismiss",
    ]);
    const coachMap = new Map<string, CoachSlot>();
    for (const e of evRows) {
      const name = e.event_name as string;
      if (!COACH_EVENTS.has(name)) continue;
      const surface = ((e.target as string | null) ?? "unknown") || "unknown";
      const slot = coachMap.get(surface) ?? {
        impressions: 0,
        clicks: 0,
        dismisses: 0,
        impressionUsers: new Set<string>(),
      };
      if (name === "coach_cal_cta_impression") {
        slot.impressions += 1;
        slot.impressionUsers.add(
          (e.user_id as string | null) ?? `anon:${e.session_id}`,
        );
      } else if (name === "coach_cal_cta_click") {
        slot.clicks += 1;
      } else if (name === "coach_cal_cta_dismiss") {
        slot.dismisses += 1;
      }
      coachMap.set(surface, slot);
    }
    const coachCalCtas: CoachCalCtaRow[] = Array.from(coachMap.entries())
      .map(([surface, s]) => {
        const walkAways = Math.max(0, s.impressions - s.clicks - s.dismisses);
        return {
          surface,
          impressions: s.impressions,
          clicks: s.clicks,
          dismisses: s.dismisses,
          walkAways,
          uniqueImpressionUsers: s.impressionUsers.size,
          clickRate: s.impressions > 0 ? s.clicks / s.impressions : 0,
          dismissRate: s.impressions > 0 ? s.dismisses / s.impressions : 0,
        };
      })
      .sort((a, b) => b.impressions - a.impressions);

    // Suppress unused-var warning while still surfacing the count for parity.
    void usersWithView;

    const mobileEngagement: MobileEngagementSummary = {
      windowDays: days,
      windowStart,
      priorWindowStart,
      current: computeDeviceCohort(views),
      prior: computeDeviceCohort(priorViews),
    };

    return {
      ok: true,
      summary: {
        windowDays: days,
        funnel,
        topExits,
        longestDwell,
        shortestDwell,
        topEvents,
        totalEvents: evRows.length,
        coachCalCtas,
        mobileEngagement,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load engagement summary.",
    };
  }
}

export async function getEngagementSummaryOrEmpty(
  windowDays: number = 30,
): Promise<EngagementSummary> {
  const r = await getEngagementSummaryAction(windowDays);
  return r.ok ? r.summary : emptyEngagement(windowDays);
}

export async function getViralitySummaryAction(
  windowDays: number = 30,
): Promise<EOk<ViralitySummary> | Err> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const days = Math.max(1, Math.min(365, Math.floor(windowDays)));
  const admin = createServiceRoleClient();
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1000);
    const adminIds = new Set<string>((adminProfiles ?? []).map((p) => p.id as string));

    const { data: shareRaw } = await admin
      .from("share_events")
      .select("id, actor_user_id, share_kind, channel, share_token, created_at")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(50000);
    const shares = (shareRaw ?? []).filter((s) => {
      const uid = s.actor_user_id as string | null;
      return !uid || !adminIds.has(uid);
    });

    const tokens = new Set<string>();
    for (const s of shares) {
      const t = s.share_token as string | null;
      if (t) tokens.add(t);
    }

    // Inbound visits for these tokens. We pull a wider window to catch
    // visits that arrive after the share was created (typical case).
    const { data: inboundRaw } = await admin
      .from("page_views")
      .select("session_id, share_token, user_id, created_at")
      .not("share_token", "is", null)
      .gte("created_at", windowStart)
      .limit(100000);
    const inbound = (inboundRaw ?? []).filter((v) => {
      const uid = v.user_id as string | null;
      return !uid || !adminIds.has(uid);
    });

    const inboundByToken = new Map<string, { visits: number; sessions: Set<string> }>();
    const inboundSessions = new Set<string>();
    for (const v of inbound) {
      const tok = v.share_token as string | null;
      if (!tok) continue;
      inboundSessions.add(v.session_id as string);
      const slot = inboundByToken.get(tok) ?? { visits: 0, sessions: new Set<string>() };
      slot.visits += 1;
      slot.sessions.add(v.session_id as string);
      inboundByToken.set(tok, slot);
    }

    // Signups attributable to inbound sessions: profiles whose first
    // page_view session matches an inbound session.
    const { data: profilesRaw } = await admin
      .from("profiles")
      .select("id, created_at, display_name, role")
      .gte("created_at", windowStart)
      .limit(100000);
    const newProfiles = (profilesRaw ?? []).filter((p) => (p.role as string) !== "admin");
    const newProfileIds = new Set(newProfiles.map((p) => p.id as string));

    // Re-pull views once just to find sessions that contain a new-signup user.
    const { data: signupSessRaw } = await admin
      .from("page_views")
      .select("session_id, user_id")
      .gte("created_at", windowStart)
      .limit(200000);
    const signupSessions = new Set<string>();
    for (const v of signupSessRaw ?? []) {
      const uid = v.user_id as string | null;
      if (uid && newProfileIds.has(uid)) signupSessions.add(v.session_id as string);
    }
    let inboundSignups = 0;
    for (const s of inboundSessions) if (signupSessions.has(s)) inboundSignups += 1;

    const inboundVisits = inbound.length;
    const inboundConversion =
      inboundSessions.size > 0 ? inboundSignups / inboundSessions.size : 0;

    // By-kind breakdown.
    const kindMap = new Map<string, number>();
    for (const s of shares) {
      const k = (s.share_kind as string) ?? "unknown";
      kindMap.set(k, (kindMap.get(k) ?? 0) + 1);
    }
    const byKind = Array.from(kindMap.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);

    // Top sharers.
    const sharerMap = new Map<
      string,
      { shares: number; inboundVisits: number; inboundSignups: number }
    >();
    for (const s of shares) {
      const uid = s.actor_user_id as string | null;
      if (!uid) continue;
      const slot = sharerMap.get(uid) ?? { shares: 0, inboundVisits: 0, inboundSignups: 0 };
      slot.shares += 1;
      const tok = s.share_token as string | null;
      if (tok) {
        const inb = inboundByToken.get(tok);
        if (inb) {
          slot.inboundVisits += inb.visits;
          for (const sess of inb.sessions) {
            if (signupSessions.has(sess)) slot.inboundSignups += 1;
          }
        }
      }
      sharerMap.set(uid, slot);
    }

    // Resolve names for top sharers.
    const sharerIds = Array.from(sharerMap.keys()).slice(0, 100);
    const nameMap = new Map<string, string | null>();
    if (sharerIds.length > 0) {
      const { data: nameRows } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", sharerIds);
      for (const r of nameRows ?? []) {
        nameMap.set(r.id as string, (r.display_name as string | null) ?? null);
      }
    }
    const topSharers = Array.from(sharerMap.entries())
      .map(([userId, v]) => ({
        userId,
        displayName: nameMap.get(userId) ?? null,
        shares: v.shares,
        inboundVisits: v.inboundVisits,
        inboundSignups: v.inboundSignups,
      }))
      .sort((a, b) => b.shares - a.shares || b.inboundVisits - a.inboundVisits)
      .slice(0, 15);

    // Recent shares with attributed visit counts.
    const recentShares = shares.slice(0, 20).map((s) => {
      const tok = s.share_token as string | null;
      const inb = tok ? inboundByToken.get(tok) : null;
      const uid = s.actor_user_id as string | null;
      return {
        id: s.id as number,
        createdAt: s.created_at as string,
        actorName: uid ? nameMap.get(uid) ?? null : null,
        kind: s.share_kind as string,
        channel: (s.channel as string | null) ?? null,
        inboundVisits: inb?.visits ?? 0,
      };
    });

    // K-factor proxy: avg inbound signups produced per share creator.
    const sharers = sharerMap.size;
    const totalInboundSignupsAttributed = Array.from(sharerMap.values()).reduce(
      (acc, v) => acc + v.inboundSignups,
      0,
    );
    const kFactor = sharers > 0 ? totalInboundSignupsAttributed / sharers : 0;

    return {
      ok: true,
      summary: {
        windowDays: days,
        shares: {
          total: shares.length,
          byKind,
          inboundVisits,
          inboundSessions: inboundSessions.size,
          inboundSignups,
          inboundConversion,
        },
        kFactor,
        topSharers,
        recentShares,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load virality summary.",
    };
  }
}

export async function getViralitySummaryOrEmpty(
  windowDays: number = 30,
): Promise<ViralitySummary> {
  const r = await getViralitySummaryAction(windowDays);
  return r.ok ? r.summary : emptyVirality(windowDays);
}

export type ShareLifetimeSummary = {
  distinctSharers: number;
  totalShares: number;
};

export type AttributedSignupsByUser = Record<string, number>;

/** Cache attribution since the join is moderately expensive and the data
 *  doesn't shift minute-to-minute. 15min is plenty for an admin tile. */
let attributionCache: { ts: number; data: AttributedSignupsByUser } | null = null;
const ATTRIBUTION_TTL_MS = 15 * 60 * 1000;

/** For each user who has ever sent a share, count distinct new-profile
 *  signups attributed to them via last-touch: the most recent share_token a
 *  signup session visited before the profile was created wins. Admins are
 *  excluded from both the attribution numerator and as recipients. */
export async function getAttributedSignupsByUserAction(): Promise<
  { ok: true; counts: AttributedSignupsByUser } | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  if (attributionCache && Date.now() - attributionCache.ts < ATTRIBUTION_TTL_MS) {
    return { ok: true, counts: attributionCache.data };
  }

  try {
    const admin = createServiceRoleClient();

    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1000);
    const adminIds = new Set<string>((adminProfiles ?? []).map((p) => p.id as string));

    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, created_at, role")
      .limit(200000);
    const profileCreatedAt = new Map<string, number>();
    for (const row of (profileRows ?? []) as Array<{
      id: string;
      created_at: string | null;
      role: string | null;
    }>) {
      if (row.role === "admin" || !row.created_at) continue;
      const ts = Date.parse(row.created_at);
      if (Number.isFinite(ts)) profileCreatedAt.set(row.id, ts);
    }

    const { data: shareRows } = await admin
      .from("share_events")
      .select("share_token, actor_user_id, created_at")
      .not("share_token", "is", null)
      .not("actor_user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200000);
    // Keep the most recent owner per token (first occurrence in the desc list).
    const tokenOwner = new Map<string, string>();
    for (const row of (shareRows ?? []) as Array<{
      share_token: string;
      actor_user_id: string;
    }>) {
      if (!tokenOwner.has(row.share_token)) {
        tokenOwner.set(row.share_token, row.actor_user_id);
      }
    }

    // Sessions whose user_id resolves to a non-admin profile we've seen.
    const { data: userViewRows } = await admin
      .from("page_views")
      .select("session_id, user_id")
      .not("user_id", "is", null)
      .limit(500000);
    const profileBySession = new Map<string, string>();
    for (const v of (userViewRows ?? []) as Array<{
      session_id: string;
      user_id: string;
    }>) {
      if (!profileCreatedAt.has(v.user_id)) continue;
      if (!profileBySession.has(v.session_id)) {
        profileBySession.set(v.session_id, v.user_id);
      }
    }

    // Token visits — anonymous and authed — grouped by session.
    const { data: tokenViewRows } = await admin
      .from("page_views")
      .select("session_id, share_token, created_at")
      .not("share_token", "is", null)
      .limit(500000);

    type Visit = { token: string; ts: number };
    const visitsBySession = new Map<string, Visit[]>();
    for (const v of (tokenViewRows ?? []) as Array<{
      session_id: string;
      share_token: string;
      created_at: string | null;
    }>) {
      if (!profileBySession.has(v.session_id)) continue;
      const ts = v.created_at ? Date.parse(v.created_at) : NaN;
      if (!Number.isFinite(ts)) continue;
      const arr = visitsBySession.get(v.session_id) ?? [];
      arr.push({ token: v.share_token, ts });
      visitsBySession.set(v.session_id, arr);
    }

    const counts: AttributedSignupsByUser = {};
    const creditedProfiles = new Set<string>();
    for (const [sessionId, visits] of visitsBySession) {
      const profileId = profileBySession.get(sessionId);
      if (!profileId) continue;
      // A user only counts once across all their sessions — pick the latest
      // touch they ever had, period.
      if (creditedProfiles.has(profileId)) continue;
      const profileTs = profileCreatedAt.get(profileId);
      if (profileTs === undefined) continue;
      const eligible = visits.filter((v) => v.ts <= profileTs);
      if (eligible.length === 0) continue;
      eligible.sort((a, b) => b.ts - a.ts);
      const winner = eligible[0];
      const ownerId = tokenOwner.get(winner.token);
      if (!ownerId || adminIds.has(ownerId) || ownerId === profileId) continue;
      counts[ownerId] = (counts[ownerId] ?? 0) + 1;
      creditedProfiles.add(profileId);
    }

    attributionCache = { ts: Date.now(), data: counts };
    return { ok: true, counts };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to compute attribution.",
    };
  }
}

/** Lifetime distinct-sharer count for the Overview tile. Excludes admins so
 *  that test shares don't inflate the number. */
export async function getShareLifetimeSummaryAction(): Promise<
  { ok: true; summary: ShareLifetimeSummary } | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  try {
    const admin = createServiceRoleClient();
    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1000);
    const adminIds = new Set<string>((adminProfiles ?? []).map((p) => p.id as string));

    const { data: shareRaw } = await admin
      .from("share_events")
      .select("actor_user_id")
      .not("actor_user_id", "is", null)
      .limit(200000);
    const distinct = new Set<string>();
    let total = 0;
    for (const row of (shareRaw ?? []) as Array<{ actor_user_id: string | null }>) {
      const uid = row.actor_user_id;
      if (!uid || adminIds.has(uid)) continue;
      distinct.add(uid);
      total += 1;
    }

    return {
      ok: true,
      summary: { distinctSharers: distinct.size, totalShares: total },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load share summary.",
    };
  }
}
