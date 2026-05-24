/**
 * Coach Cal version toggle — site-wide select between Cal v1 (pre-Phase-2
 * behavior) and Cal v2 (full Phase 2 stack: provenance gate, rescue,
 * server-side label aliasing).
 *
 * Migration `20260525133000_site_settings_coach_cal_version.sql` adds the
 * column with default 'v2'. Existing site_settings rows are migrated to
 * 'v2' so production defaults to the new stack.
 *
 * Lookup precedence at runtime (agent.ts + tools.ts read this):
 *   1. `COACH_CAL_PROVENANCE_GATE=off` env var — emergency global kill
 *      switch on Cloud Run, takes effect without a deploy.
 *   2. Site setting `coach_cal_version` (this module) — admin-flippable
 *      via /admin/site-settings.
 *   3. Default 'v2' when nothing's set or the DB lookup fails.
 *
 * "v1" = no provenance gate, no rescue, no server-side label aliasing.
 *        Catalog fixes + non-behavioral bug fixes still apply.
 * "v2" = full Phase 2 stack as shipped.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type CoachCalVersion = "v1" | "v2";

/** Read the active version from site_settings. Returns 'v2' on any
 *  failure (DB unreachable, row missing, column missing in pre-migration
 *  environments). Callers don't need to handle errors. */
export async function getCoachCalVersion(): Promise<CoachCalVersion> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("coach_cal_version")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error || !data) return "v2";
    const v = (data as { coach_cal_version?: unknown }).coach_cal_version;
    return v === "v1" ? "v1" : "v2";
  } catch {
    return "v2";
  }
}

/** Write the version. Caller must verify admin authz before calling. */
export async function setCoachCalVersion(next: CoachCalVersion): Promise<void> {
  if (next !== "v1" && next !== "v2") {
    throw new Error(`Invalid Coach Cal version: ${next}`);
  }
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, coach_cal_version: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
