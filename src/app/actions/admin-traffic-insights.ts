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

export type EngagementSummary = {
  windowDays: number;
  funnel: FunnelStep[];
  topExits: Array<{ path: string; exits: number; avgDwellMs: number | null }>;
  longestDwell: Array<{ path: string; avgDwellMs: number; samples: number }>;
  shortestDwell: Array<{ path: string; avgDwellMs: number; samples: number }>;
  topEvents: Array<{ event: string; count: number; uniqueUsers: number }>;
  totalEvents: number;
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

function emptyEngagement(windowDays: number): EngagementSummary {
  return {
    windowDays,
    funnel: [],
    topExits: [],
    longestDwell: [],
    shortestDwell: [],
    topEvents: [],
    totalEvents: 0,
  };
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
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1000);
    const adminIds = new Set<string>((adminProfiles ?? []).map((p) => p.id as string));

    // Page views (for funnel + exits + dwell). Exclude bots and admins.
    const { data: pvRaw } = await admin
      .from("page_views")
      .select("session_id, user_id, path, dwell_ms, is_exit, created_at")
      .eq("is_bot", false)
      .gte("created_at", windowStart)
      .limit(200000);
    const pv = (pvRaw ?? []) as Array<{
      session_id: string;
      user_id: string | null;
      path: string;
      dwell_ms: number | null;
      is_exit: boolean | null;
      created_at: string;
    }>;

    const adminSessionIds = new Set<string>();
    for (const v of pv) {
      if (v.user_id && adminIds.has(v.user_id)) adminSessionIds.add(v.session_id);
    }
    const views = pv.filter((v) => !adminSessionIds.has(v.session_id));

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

    // First-play signal: any play created in window by a new signup.
    const { data: playsRaw } = await admin
      .from("plays")
      .select("created_by")
      .gte("created_at", windowStart)
      .limit(100000);
    const firstPlayUsers = new Set<string>();
    for (const p of playsRaw ?? []) {
      const uid = p.created_by as string | null;
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

    const visitorCount = sessions.size;
    const signupCount = newSignups.length;
    const playCount = firstPlayUsers.size;
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

    // UI events.
    const { data: evRaw } = await admin
      .from("ui_events")
      .select("event_name, user_id, session_id")
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

    // Suppress unused-var warning while still surfacing the count for parity.
    void usersWithView;

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
