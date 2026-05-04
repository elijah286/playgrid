"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getAnalyticsExcludedUserIds } from "@/lib/site/analytics-exclusions-config";

export type ActivationCohort = {
  bucket: string;
  count: number;
  percentage: number;
};

export type ActivationFunnel = {
  totalUsers: number;
  playbookCreators: number;
  playCreators: number;
  playCreators16Plus: number;
  coachAiUsers: number;
};

export type SportVariantDistribution = {
  variant: string;
  count: number;
  percentage: number;
};

export type SportVariantTrend = {
  month: string;
  variants: Record<string, number>;
};

/** Time windows for the monetization dashboard. "all" disables filtering. */
export type MonetizationWindow = "all" | "month" | "week" | "today";

export type MonetizationSummary = {
  window: MonetizationWindow;
  cohorts: ActivationCohort[];
  funnel: ActivationFunnel;
  sportVariants: SportVariantDistribution[];
  sportVariantTrends: SportVariantTrend[];
};

/** Returns the inclusive lower bound (UTC) for a given window, or null
 *  when "all" — which means no time filter. Trends are always all-time. */
function windowStart(window: MonetizationWindow): Date | null {
  const now = new Date();
  if (window === "today") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  if (window === "week") {
    // ISO week-ish: Monday 00:00 UTC.
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayOfWeek = (d.getUTCDay() + 6) % 7; // 0 = Monday
    d.setUTCDate(d.getUTCDate() - dayOfWeek);
    return d;
  }
  if (window === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  return null;
}

export async function getActivationSummaryAction(
  window: MonetizationWindow = "all",
): Promise<{ ok: true; summary: MonetizationSummary } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };

  try {
    const admin = createServiceRoleClient();
    const excludedIds = await getAnalyticsExcludedUserIds();
    const startDate = windowStart(window);
    const startIso = startDate ? startDate.toISOString() : null;

    // ---- Total users: profiles created within window (or all-time). ----
    let profilesQuery = admin.from("profiles").select("id", { count: "exact" });
    if (startIso) profilesQuery = profilesQuery.gte("created_at", startIso);
    const { data: profilesRaw } = await profilesQuery;
    const profileIds = (profilesRaw ?? [])
      .map((r: { id: string }) => r.id)
      .filter((id) => !excludedIds.has(id));
    const totalUsers = profileIds.length;

    // ---- Plays + their owning playbook → owner per play, scoped to window. ----
    let playsQuery = admin.from("plays").select(
      "playbooks!inner(team_id, teams!inner(org_id, organizations!inner(owner_id)))",
    );
    if (startIso) playsQuery = playsQuery.gte("created_at", startIso);
    const { data: playRows } = await playsQuery;

    const playsByOwner: Record<string, number> = {};
    if (playRows) {
      for (const row of playRows as Array<{
        playbooks?: {
          teams?: { organizations?: { owner_id?: string } | { owner_id?: string }[] };
        };
      }>) {
        const orgs = row.playbooks?.teams?.organizations;
        const ownerId = Array.isArray(orgs)
          ? orgs[0]?.owner_id
          : (orgs as { owner_id?: string } | undefined)?.owner_id;
        if (!ownerId || excludedIds.has(ownerId)) continue;
        playsByOwner[ownerId] = (playsByOwner[ownerId] ?? 0) + 1;
      }
    }
    const playCounts = Object.values(playsByOwner);

    const cohortDefs: Array<{ bucket: string; matches: (n: number) => boolean }> = [
      { bucket: "0 plays", matches: (n) => n === 0 },
      { bucket: "1-5 plays", matches: (n) => n >= 1 && n <= 5 },
      { bucket: "6-10 plays", matches: (n) => n >= 6 && n <= 10 },
      { bucket: "11-15 plays", matches: (n) => n >= 11 && n <= 15 },
      { bucket: "16+ plays", matches: (n) => n >= 16 },
    ];

    const cohorts: ActivationCohort[] = cohortDefs.map(({ bucket, matches }) => {
      // For the "0 plays" bucket within a window, count users who exist
      // in scope but didn't create a play in that window. For other
      // buckets, count owners with that many plays in scope.
      const count = bucket === "0 plays"
        ? Math.max(0, totalUsers - Object.keys(playsByOwner).length)
        : playCounts.filter(matches).length;
      return { bucket, count, percentage: 0 };
    });
    const cohortTotal = cohorts.reduce((sum, c) => sum + c.count, 0);
    cohorts.forEach((c) => {
      c.percentage = cohortTotal > 0 ? c.count / cohortTotal : 0;
    });

    // ---- Playbook creators within window. ----
    let pbQuery = admin
      .from("playbooks")
      .select(
        "id, sport_variant, created_at, teams!inner(organizations!inner(owner_id))",
      )
      .not("sport_variant", "is", null);
    if (startIso) pbQuery = pbQuery.gte("created_at", startIso);
    const { data: pbRows } = await pbQuery;

    const playbookOwners = new Set<string>();
    const sportVariantCounts: Record<string, number> = {};
    const trendsByMonth: Record<string, Record<string, number>> = {};
    if (pbRows) {
      for (const row of pbRows as Array<{
        sport_variant: string | null;
        created_at: string | null;
        teams?: { organizations?: { owner_id?: string } | { owner_id?: string }[] };
      }>) {
        const orgs = row.teams?.organizations;
        const ownerId = Array.isArray(orgs)
          ? orgs[0]?.owner_id
          : (orgs as { owner_id?: string } | undefined)?.owner_id;
        if (!ownerId || excludedIds.has(ownerId)) continue;
        playbookOwners.add(ownerId);

        const variant = row.sport_variant ?? "unknown";
        sportVariantCounts[variant] = (sportVariantCounts[variant] ?? 0) + 1;

        // Trends are computed from the same scoped data so that "this week"
        // shows the trend slice for this week, not all-time.
        if (row.created_at) {
          const d = new Date(row.created_at);
          const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          if (!trendsByMonth[month]) trendsByMonth[month] = {};
          trendsByMonth[month][variant] = (trendsByMonth[month][variant] ?? 0) + 1;
        }
      }
    }

    // ---- Coach AI users within window. ----
    // The aggregate `coach_ai_usage` table predates the per-event log,
    // so historical "all time" / "this month" lookups still work via the
    // aggregate. "today" and "this week" require the event log.
    let coachAiUsers = 0;
    if (window === "all") {
      const { data: usageRows } = await admin
        .from("coach_ai_usage")
        .select("user_id");
      const distinct = new Set<string>();
      for (const r of (usageRows ?? []) as Array<{ user_id: string }>) {
        if (!excludedIds.has(r.user_id)) distinct.add(r.user_id);
      }
      coachAiUsers = distinct.size;
    } else if (window === "month") {
      const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
        .toISOString()
        .slice(0, 10);
      const { data: usageRows } = await admin
        .from("coach_ai_usage")
        .select("user_id")
        .eq("month", monthStart);
      const distinct = new Set<string>();
      for (const r of (usageRows ?? []) as Array<{ user_id: string }>) {
        if (!excludedIds.has(r.user_id)) distinct.add(r.user_id);
      }
      coachAiUsers = distinct.size;
    } else {
      // today / week: query the event log
      const { data: eventRows } = await admin
        .from("coach_ai_message_events")
        .select("user_id")
        .gte("occurred_at", startIso!);
      const distinct = new Set<string>();
      for (const r of (eventRows ?? []) as Array<{ user_id: string }>) {
        if (!excludedIds.has(r.user_id)) distinct.add(r.user_id);
      }
      coachAiUsers = distinct.size;
    }

    const playCreators = Object.keys(playsByOwner).length;
    const playCreators16Plus = playCounts.filter((n) => n >= 16).length;

    const totalVariants = Object.values(sportVariantCounts).reduce((a, b) => a + b, 0);
    const sportVariants: SportVariantDistribution[] = Object.entries(sportVariantCounts)
      .map(([variant, count]) => ({
        variant,
        count,
        percentage: totalVariants > 0 ? count / totalVariants : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const sportVariantTrends: SportVariantTrend[] = Object.entries(trendsByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, variants]) => ({ month, variants }));

    return {
      ok: true,
      summary: {
        window,
        cohorts,
        funnel: {
          totalUsers,
          playbookCreators: playbookOwners.size,
          playCreators,
          playCreators16Plus,
          coachAiUsers,
        },
        sportVariants,
        sportVariantTrends,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg };
  }
}
