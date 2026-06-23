"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { getAnalyticsExcludedUserIds } from "@/lib/site/analytics-exclusions-config";
import {
  summarizeAppInstalls,
  type AppInstallRecord,
  type AppMetricsSummary,
} from "@/lib/analytics/app-metrics";

type Ok = { ok: true; summary: AppMetricsSummary };
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

/**
 * Native-app install / active-user metrics with internal + tester accounts
 * excluded — mirrors the web traffic dashboard's exclusion exactly:
 *   admins (profiles.role='admin') + getAnalyticsExcludedUserIds()
 *   (company-domain @xogridmaker.com + the configured owner/family/test list).
 *
 * `app_installs` is written on every native launch, so before public release it
 * is dominated by TestFlight testers, Apple App Review, and the team's own dev
 * devices. Counting those as users is exactly what made a pre-launch build look
 * like it had strong retention. This action bakes the exclusion in from day one
 * and reports anonymous (never-signed-in) opens separately from real installs.
 */
export async function getAppMetricsSummaryAction(
  activeWindowDays = 7,
): Promise<Ok | Err> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const days = Math.max(1, Math.min(90, Math.floor(activeWindowDays)));
  const admin = createServiceRoleClient();

  try {
    // Internal accounts: admins by role + configured/company-domain exclusions,
    // assembled the same way getTrafficSummaryAction builds its set.
    const adminProfiles = await fetchAllRows<{ id: string }>(() =>
      admin.from("profiles").select("id").eq("role", "admin"),
    );
    const excluded = new Set<string>(adminProfiles.map((p) => p.id));
    for (const id of await getAnalyticsExcludedUserIds()) excluded.add(id);

    const rows = await fetchAllRows<AppInstallRecord>(() =>
      admin
        .from("app_installs")
        .select("platform, user_id, first_opened_at, last_opened_at"),
    );

    const summary = summarizeAppInstalls(rows, excluded, {
      nowMs: Date.now(),
      activeWindowDays: days,
    });
    return { ok: true, summary };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load app metrics.",
    };
  }
}
