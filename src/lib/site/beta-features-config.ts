import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type BetaFeatureKey = "coach_ai" | "game_mode" | "game_results";
export type BetaFeatureScope = "off" | "me" | "all";

export type BetaFeatures = Record<BetaFeatureKey, BetaFeatureScope>;

const DEFAULTS: BetaFeatures = {
  coach_ai: "off",
  game_mode: "off",
  game_results: "off",
};

function normalize(input: unknown): BetaFeatures {
  const raw = (input ?? {}) as Record<string, unknown>;
  const out: BetaFeatures = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as BetaFeatureKey[]) {
    const v = raw[k];
    if (v === "off" || v === "me" || v === "all") out[k] = v;
  }
  return out;
}

export async function getBetaFeatures(): Promise<BetaFeatures> {
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
 *   "off" → never
 *   "me"  → only site admins (the toggling admin testing in production)
 *   "all" → any otherwise-entitled user (caller decides entitlement, e.g. coach role)
 */
export function isBetaFeatureAvailable(
  scope: BetaFeatureScope,
  ctx: { isAdmin: boolean; isEntitled: boolean },
): boolean {
  if (scope === "off") return false;
  if (scope === "me") return ctx.isAdmin;
  return ctx.isEntitled;
}
