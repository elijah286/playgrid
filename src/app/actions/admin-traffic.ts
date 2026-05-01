"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getAnalyticsExcludedUserIds } from "@/lib/site/analytics-exclusions-config";

export type TrafficSummary = {
  windowDays: number;
  totals: {
    views: number;
    uniqueSessions: number;
    signups: number;
    totalUsers: number;
    activeLast7: number;
    activeLast30: number;
  };
  conversion: {
    sessions: number;
    sessionsWithSignup: number;
    rate: number;
  };
  byDay: Array<{ day: string; views: number; signups: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  topPaths: Array<{ path: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
  deviceMix: { mobile: number; tablet: number; desktop: number; unknown: number };
  utmSources: Array<{ source: string; count: number }>;
};

type Ok = { ok: true; summary: TrafficSummary };
type Err = { ok: false; error: string };

function emptySummary(windowDays: number): TrafficSummary {
  return {
    windowDays,
    totals: {
      views: 0,
      uniqueSessions: 0,
      signups: 0,
      totalUsers: 0,
      activeLast7: 0,
      activeLast30: 0,
    },
    conversion: { sessions: 0, sessionsWithSignup: 0, rate: 0 },
    byDay: [],
    topReferrers: [],
    topPaths: [],
    topCountries: [],
    deviceMix: { mobile: 0, tablet: 0, desktop: 0, unknown: 0 },
    utmSources: [],
  };
}

function dayKey(d: Date): string {
  // UTC YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

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

type ViewRow = {
  session_id: string;
  path: string;
  referrer: string | null;
  country: string | null;
  device: string | null;
  utm_source: string | null;
  user_id: string | null;
  created_at: string;
};

export async function getTrafficSummaryAction(
  windowDays: number = 30,
): Promise<Ok | Err> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const days = Math.max(1, Math.min(365, Math.floor(windowDays)));
  const admin = createServiceRoleClient();
  const now = Date.now();
  const windowStart = new Date(now - days * 24 * 60 * 60 * 1000);
  const sevenStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyStart = new Date(now - 30 * 24 * 60 * 60 * 1000);

  try {
    // Admins are excluded from traffic stats so internal activity doesn't skew the numbers.
    const { data: adminProfiles, error: adminsErr } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1000);
    if (adminsErr) throw new Error(adminsErr.message);
    const adminIds = new Set<string>((adminProfiles ?? []).map((p) => p.id as string));

    // Plus any user IDs the admin has explicitly excluded (own/family/test
    // accounts configured under Analytics → Settings).
    const excludedExtra = await getAnalyticsExcludedUserIds();
    for (const id of excludedExtra) adminIds.add(id);

    // Pull all non-bot views in window. Volume should be manageable for an admin tool.
    const { data: viewsRaw, error: viewsErr } = await admin
      .from("page_views")
      .select(
        "session_id, path, referrer, country, device, utm_source, user_id, created_at",
      )
      .eq("is_bot", false)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(100000);
    if (viewsErr) throw new Error(viewsErr.message);
    const allViews: ViewRow[] = (viewsRaw ?? []) as ViewRow[];

    // Exclude any session that was ever authenticated as an admin — catches
    // pre-login anonymous views from that same browser session too.
    const adminSessionIds = new Set<string>();
    for (const v of allViews) {
      if (v.user_id && adminIds.has(v.user_id)) adminSessionIds.add(v.session_id);
    }
    const views = allViews.filter((v) => !adminSessionIds.has(v.session_id));

    // Signups in window (excluding admins).
    const { data: newProfilesRaw, error: signupsErr } = await admin
      .from("profiles")
      .select("id, role, created_at")
      .gte("created_at", windowStart.toISOString())
      .limit(100000);
    if (signupsErr) throw new Error(signupsErr.message);
    const newProfiles = (newProfilesRaw ?? []).filter(
      (p) => (p.role as string) !== "admin" && !adminIds.has(p.id as string),
    );

    const signupUserIds = new Set<string>(newProfiles.map((p) => p.id as string));

    // Total users (excluding admins and explicit exclusions).
    const { count: rawTotalUsersCount } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .neq("role", "admin");
    const totalUsersCount = Math.max(
      0,
      (rawTotalUsersCount ?? 0) - excludedExtra.size,
    );

    // Active cohorts via user_activity_days (excluding admins).
    const { data: active7 } = await admin
      .from("user_activity_days")
      .select("user_id")
      .gte("day", sevenStart.toISOString().slice(0, 10))
      .limit(100000);
    const { data: active30 } = await admin
      .from("user_activity_days")
      .select("user_id")
      .gte("day", thirtyStart.toISOString().slice(0, 10))
      .limit(100000);

    const activeLast7 = new Set(
      (active7 ?? [])
        .map((r) => r.user_id as string)
        .filter((id) => !adminIds.has(id)),
    ).size;
    const activeLast30 = new Set(
      (active30 ?? [])
        .map((r) => r.user_id as string)
        .filter((id) => !adminIds.has(id)),
    ).size;

    // Aggregate.
    const uniqueSessions = new Set<string>();
    const sessionsWithSignupUser = new Set<string>();
    const byDayMap = new Map<string, { views: number; signups: number }>();
    const referrerCounts = new Map<string, number>();
    const pathCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const utmCounts = new Map<string, number>();
    const deviceMix = { mobile: 0, tablet: 0, desktop: 0, unknown: 0 };

    // Seed byDay with zeros for each day in window.
    for (let i = 0; i < days; i++) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      byDayMap.set(dayKey(d), { views: 0, signups: 0 });
    }

    for (const v of views) {
      uniqueSessions.add(v.session_id);
      if (v.user_id && signupUserIds.has(v.user_id)) {
        sessionsWithSignupUser.add(v.session_id);
      }

      const dk = dayKey(new Date(v.created_at));
      const bucket = byDayMap.get(dk) ?? { views: 0, signups: 0 };
      bucket.views += 1;
      byDayMap.set(dk, bucket);

      const refKey = v.referrer && v.referrer.trim() ? v.referrer : "Direct";
      referrerCounts.set(refKey, (referrerCounts.get(refKey) ?? 0) + 1);

      pathCounts.set(v.path, (pathCounts.get(v.path) ?? 0) + 1);

      if (v.country) {
        countryCounts.set(v.country, (countryCounts.get(v.country) ?? 0) + 1);
      }

      if (v.utm_source) {
        utmCounts.set(v.utm_source, (utmCounts.get(v.utm_source) ?? 0) + 1);
      }

      switch (v.device) {
        case "mobile":
          deviceMix.mobile += 1;
          break;
        case "tablet":
          deviceMix.tablet += 1;
          break;
        case "desktop":
          deviceMix.desktop += 1;
          break;
        default:
          deviceMix.unknown += 1;
      }
    }

    // Signups by day.
    for (const p of newProfiles) {
      const dk = dayKey(new Date((p.created_at as string) ?? new Date().toISOString()));
      const bucket = byDayMap.get(dk);
      if (bucket) bucket.signups += 1;
    }

    const byDay = Array.from(byDayMap.entries())
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    const topReferrers = Array.from(referrerCounts.entries())
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topPaths = Array.from(pathCounts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topCountries = Array.from(countryCounts.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const utmSources = Array.from(utmCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const sessions = uniqueSessions.size;
    const sessionsWithSignup = sessionsWithSignupUser.size;
    const rate = sessions > 0 ? sessionsWithSignup / sessions : 0;

    const summary: TrafficSummary = {
      windowDays: days,
      totals: {
        views: views.length,
        uniqueSessions: sessions,
        signups: newProfiles.length,
        totalUsers: totalUsersCount,
        activeLast7,
        activeLast30,
      },
      conversion: { sessions, sessionsWithSignup, rate },
      byDay,
      topReferrers,
      topPaths,
      topCountries,
      deviceMix,
      utmSources,
    };

    return { ok: true, summary };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load traffic summary.",
    };
  }
}

export async function getTrafficSummaryOrEmpty(windowDays: number = 30): Promise<TrafficSummary> {
  const res = await getTrafficSummaryAction(windowDays);
  if (res.ok) return res.summary;
  return emptySummary(windowDays);
}
