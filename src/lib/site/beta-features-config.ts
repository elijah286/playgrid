import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";
const CACHE_TAG = "site-beta-features";

export type BetaFeatureKey =
  | "game_results"
  | "marketing_content"
  | "team_calendar"
  | "play_comments"
  | "version_history"
  | "team_messaging"
  | "coach_ai_image_upload"
  | "football_library"
  | "offline_auto_cache"
  | "photo_play_import"
  | "new_play_sheet";
export type BetaFeatureScope = "off" | "me" | "all" | "custom";

export type BetaFeatures = Record<BetaFeatureKey, BetaFeatureScope>;

const DEFAULTS: BetaFeatures = {
  game_results: "off",
  marketing_content: "off",
  team_calendar: "off",
  play_comments: "off",
  version_history: "off",
  team_messaging: "off",
  // Coach Cal photo/file upload. 2026-06-11: hard-disabled in code via
  // COACH_CAL_IMAGE_UPLOADS_ENABLED (unreliable vision pipeline + expensive
  // per-image calls). This toggle is now INERT — both the client attach UI
  // and the server image path are gated on that master switch, so flipping
  // this scope has no effect until the switch is re-enabled.
  coach_ai_image_upload: "off",
  // Football Library — /learn/library and every concept/route page
  // under it. Public (un-gated 2026-05-26) so the catalog can be
  // crawled and indexed; flip back to "me" or "off" to hide.
  football_library: "all",
  // Phase 2 offline: auto-download ALL of a coach's playbooks into the
  // native app's IndexedDB cache (vs today's opt-in per-playbook download)
  // so they're available offline without thinking about it. Native-only and
  // gated — start "off", flip to "me" for site-admin testing, then "all".
  offline_auto_cache: "off",
  // Photo play import (2026-07): photograph a play sheet → per-panel
  // semantic extraction into a PlaySpec → coach reviews side-by-side →
  // save. Distinct from the dead coach_ai_image_upload chat pipeline —
  // this is the playbook-level import flow with a review step.
  // Defaults "me" (site admins only) for prod testing; widen from the
  // admin Beta features panel once the eval bar is met.
  photo_play_import: "me",
  // New "Start a new play" sheet (2026-07): two-door layout — Generate with
  // Cal (AI, entitlement-aware upsell) vs Start from a formation (grid hidden
  // until chosen) + a blank-canvas escape hatch. Ships dark; "me" = site admins
  // preview in prod, widen to "all" from the Beta features panel once verified.
  new_play_sheet: "me",
};

/** Safe "everything off" fallback for callers that need a value even when
 *  the upstream fetch can't run (e.g. a Capacitor shell with no signal). */
export const DEFAULT_BETA_FEATURES: BetaFeatures = { ...DEFAULTS };

function normalize(input: unknown): BetaFeatures {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out: BetaFeatures = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as BetaFeatureKey[]) {
    const v = raw[k];
    if (v === "off" || v === "me" || v === "all" || v === "custom") out[k] = v;
  }
  return out;
}

const fetchBetaFeatures = unstable_cache(
  async (): Promise<BetaFeatures> => {
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin
        .from("site_settings")
        .select("beta_features")
        .eq("id", SITE_ROW_ID)
        .maybeSingle();
      if (error || !data) return { ...DEFAULTS };
      return normalize((data as { beta_features?: unknown }).beta_features);
    } catch {
      return { ...DEFAULTS };
    }
  },
  [CACHE_TAG],
  { tags: [CACHE_TAG], revalidate: 60 },
);

export async function getBetaFeatures(): Promise<BetaFeatures> {
  return fetchBetaFeatures();
}

export async function setBetaFeatureScope(
  feature: BetaFeatureKey,
  scope: BetaFeatureScope,
): Promise<BetaFeatures> {
  const admin = createServiceRoleClient();
  const current = await getBetaFeatures();
  const next: BetaFeatures = { ...current, [feature]: scope };
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, beta_features: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
  return next;
}

/**
 * A feature is available to a user when:
 *   "off"    → never
 *   "me"     → only site admins (the toggling admin testing in production)
 *   "all"    → any otherwise-entitled user (caller decides entitlement, e.g. coach role)
 *   "custom" → specific emails in the allowlist (caller must provide email and allowlisted status)
 */
export function isBetaFeatureAvailable(
  scope: BetaFeatureScope,
  ctx: { isAdmin: boolean; isEntitled: boolean; isInAllowlist?: boolean },
): boolean {
  if (scope === "off") return false;
  if (scope === "me") return ctx.isAdmin;
  if (scope === "custom") return ctx.isInAllowlist ?? false;
  return ctx.isEntitled;
}


export async function getBetaFeatureAllowlistEmails(
  feature: BetaFeatureKey,
): Promise<string[]> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("beta_feature_allowlist")
      .select("email")
      .eq("feature", feature)
      .order("email");

    if (error) throw error;
    return (data ?? []).map((row) => row.email);
  } catch (e) {
    console.error("Failed to fetch allowlist emails:", e);
    return [];
  }
}

export async function addEmailToAllowlist(
  feature: BetaFeatureKey,
  email: string,
  userId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from("beta_feature_allowlist").insert({
    feature,
    email: email.toLowerCase(),
    created_by: userId,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Email already in allowlist for this feature");
    }
    throw new Error(error.message);
  }
}

export async function removeEmailFromAllowlist(
  feature: BetaFeatureKey,
  email: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("beta_feature_allowlist")
    .delete()
    .eq("feature", feature)
    .eq("email", email.toLowerCase());

  if (error) throw new Error(error.message);
}
