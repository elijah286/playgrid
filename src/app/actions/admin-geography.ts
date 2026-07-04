"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { getAnalyticsExcludedUserIds } from "@/lib/site/analytics-exclusions-config";
import { selectGeoViews } from "@/lib/admin/geo-views";

export type GeoCityPoint = {
  key: string;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  views: number;
  sessions: number;
  users: number;
  signups: number;
};

export type GeoCountryPoint = {
  country: string;
  views: number;
  sessions: number;
  users: number;
  signups: number;
};

export type GeoSummary = {
  windowDays: number;
  payingOnly: boolean;
  totals: {
    plottedViews: number;
    plottedSessions: number;
    plottedUsers: number;
    cities: number;
    countries: number;
    missingLocation: number;
  };
  cities: GeoCityPoint[];
  countries: GeoCountryPoint[];
};

type Ok = { ok: true; summary: GeoSummary };
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

type ViewRow = {
  session_id: string;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  user_id: string | null;
};

function emptySummary(windowDays: number, payingOnly = false): GeoSummary {
  return {
    windowDays,
    payingOnly,
    totals: {
      plottedViews: 0,
      plottedSessions: 0,
      plottedUsers: 0,
      cities: 0,
      countries: 0,
      missingLocation: 0,
    },
    cities: [],
    countries: [],
  };
}

export async function getGeoSummaryAction(
  windowDays: number = 30,
  payingOnly: boolean = false,
): Promise<Ok | Err> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const days = Math.max(1, Math.min(365, Math.floor(windowDays)));
  const admin = createServiceRoleClient();
  const now = Date.now();
  const windowStart = new Date(now - days * 24 * 60 * 60 * 1000);

  try {
    const adminProfiles = await fetchAllRows<{ id: string }>(() =>
      admin.from("profiles").select("id").eq("role", "admin"),
    );
    const adminIds = new Set<string>(adminProfiles.map((p) => p.id));
    const excludedExtra = await getAnalyticsExcludedUserIds();
    for (const id of excludedExtra) adminIds.add(id);

    // Paying-user filter: the set of user_ids with a paid entitlement backed
    // by real money (Stripe or Apple IAP — comp grants are free-of-charge and
    // deliberately excluded). Only loaded when the toggle is on. The
    // user_entitlements view is already time-bounded, so an expired sub won't
    // appear here.
    let payingUserIds: Set<string> | null = null;
    if (payingOnly) {
      const entitlements = await fetchAllRows<{ user_id: string; tier: string | null; source: string | null }>(() =>
        admin
          .from("user_entitlements")
          .select("user_id, tier, source")
          .neq("tier", "free")
          .in("source", ["stripe", "apple"]),
      );
      payingUserIds = new Set<string>(entitlements.map((e) => e.user_id));
    }

    const allViews = await fetchAllRows<ViewRow>(() =>
      admin
        .from("page_views")
        .select("session_id, country, region, city, latitude, longitude, user_id")
        .eq("is_bot", false)
        .gte("created_at", windowStart.toISOString())
        .order("created_at", { ascending: false }),
    );

    const views = selectGeoViews(allViews, { adminIds, payingUserIds });

    // Signups in window so we can attribute "new users" to each city.
    const newProfilesRaw = await fetchAllRows<{ id: string; role: string | null; created_at: string }>(() =>
      admin
        .from("profiles")
        .select("id, role, created_at")
        .gte("created_at", windowStart.toISOString()),
    );
    const signupUserIds = new Set<string>(
      newProfilesRaw
        .filter((p) => p.role !== "admin" && !adminIds.has(p.id))
        .map((p) => p.id),
    );

    type CityAgg = {
      country: string | null;
      region: string | null;
      city: string | null;
      latSum: number;
      lngSum: number;
      latLngN: number;
      views: number;
      sessions: Set<string>;
      users: Set<string>;
      signups: Set<string>;
    };
    type CountryAgg = {
      views: number;
      sessions: Set<string>;
      users: Set<string>;
      signups: Set<string>;
    };

    const cityMap = new Map<string, CityAgg>();
    const countryMap = new Map<string, CountryAgg>();
    let missingLocation = 0;
    const plottedSessions = new Set<string>();
    const plottedUsers = new Set<string>();

    for (const v of views) {
      // Country aggregate (works even without lat/lng).
      if (v.country) {
        const c = countryMap.get(v.country) ?? {
          views: 0,
          sessions: new Set<string>(),
          users: new Set<string>(),
          signups: new Set<string>(),
        };
        c.views += 1;
        c.sessions.add(v.session_id);
        if (v.user_id) {
          c.users.add(v.user_id);
          if (signupUserIds.has(v.user_id)) c.signups.add(v.user_id);
        }
        countryMap.set(v.country, c);
      }

      // City dot needs lat/lng — older rows captured before this column was
      // added will simply skip the map (counted in `missingLocation`).
      if (
        typeof v.latitude !== "number" ||
        typeof v.longitude !== "number" ||
        Number.isNaN(v.latitude) ||
        Number.isNaN(v.longitude)
      ) {
        missingLocation += 1;
        continue;
      }

      const key = [v.country ?? "", v.region ?? "", v.city ?? ""].join("|");
      const agg = cityMap.get(key) ?? {
        country: v.country,
        region: v.region,
        city: v.city,
        latSum: 0,
        lngSum: 0,
        latLngN: 0,
        views: 0,
        sessions: new Set<string>(),
        users: new Set<string>(),
        signups: new Set<string>(),
      };
      agg.latSum += v.latitude;
      agg.lngSum += v.longitude;
      agg.latLngN += 1;
      agg.views += 1;
      agg.sessions.add(v.session_id);
      plottedSessions.add(v.session_id);
      if (v.user_id) {
        agg.users.add(v.user_id);
        plottedUsers.add(v.user_id);
        if (signupUserIds.has(v.user_id)) agg.signups.add(v.user_id);
      }
      cityMap.set(key, agg);
    }

    const cities: GeoCityPoint[] = Array.from(cityMap.entries())
      .map(([key, a]) => ({
        key,
        country: a.country,
        region: a.region,
        city: a.city,
        latitude: a.latSum / a.latLngN,
        longitude: a.lngSum / a.latLngN,
        views: a.views,
        sessions: a.sessions.size,
        users: a.users.size,
        signups: a.signups.size,
      }))
      .sort((a, b) => b.views - a.views);

    const countries: GeoCountryPoint[] = Array.from(countryMap.entries())
      .map(([country, a]) => ({
        country,
        views: a.views,
        sessions: a.sessions.size,
        users: a.users.size,
        signups: a.signups.size,
      }))
      .sort((a, b) => b.views - a.views);

    let plottedViews = 0;
    for (const c of cities) plottedViews += c.views;

    return {
      ok: true,
      summary: {
        windowDays: days,
        payingOnly,
        totals: {
          plottedViews,
          plottedSessions: plottedSessions.size,
          plottedUsers: plottedUsers.size,
          cities: cities.length,
          countries: countries.length,
          missingLocation,
        },
        cities,
        countries,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load geography summary.",
    };
  }
}

export async function getGeoSummaryOrEmpty(
  windowDays: number = 30,
  payingOnly: boolean = false,
): Promise<GeoSummary> {
  const res = await getGeoSummaryAction(windowDays, payingOnly);
  if (res.ok) return res.summary;
  return emptySummary(windowDays, payingOnly);
}
