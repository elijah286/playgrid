import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";
const CACHE_TAG = "site-beta-features";

export type BetaFeatureKey =
  | "coach_ai"
  | "game_mode"
  | "game_results"
  | "marketing_content"
  | "team_calendar"
  | "play_comments"
  | "version_history"
  | "practice_plans";
export type BetaFeatureScope = "off" | "me" | "all" | "custom";

export type BetaFeatures = Record<BetaFeatureKey, BetaFeatureScope>;

const DEFAULTS: BetaFeatures = {
  coach_ai: "off",
  game_mode: "off",
  game_results: "off",
  marketing_content: "off",
  team_calendar: "off",
  play_comments: "off",
  version_history: "off",
  practice_plans: "off",
};

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
