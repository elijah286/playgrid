import type { Entitlement, SubscriptionTier } from "./entitlement";

/**
 * Single source of truth for what each tier unlocks. Update this file when a
 * feature moves between tiers; never scatter tier checks across UI/server code.
 */

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  coach: 1,
  coach_ai: 2,
};

export function tierAtLeast(entitlement: Entitlement | null, minimum: SubscriptionTier): boolean {
  if (!entitlement) return minimum === "free";
  return TIER_RANK[entitlement.tier] >= TIER_RANK[minimum];
}

/** Play editor, playsheet printing — always free. Provided for symmetry. */
export function canUsePlayEditor(_entitlement: Entitlement | null): boolean {
  return true;
}

export function canPrintPlaysheets(_entitlement: Entitlement | null): boolean {
  return true;
}

/** Wristbands: Coach+ only. */
export function canUseWristbands(entitlement: Entitlement | null): boolean {
  return tierAtLeast(entitlement, "coach");
}

/** Team features: invites, shared playbook membership, rosters. Coach+ only. */
export function canUseTeamFeatures(entitlement: Entitlement | null): boolean {
  return tierAtLeast(entitlement, "coach");
}

/** AI features (placeholder — not yet implemented). Coach AI only. */
export function canUseAiFeatures(entitlement: Entitlement | null): boolean {
  return tierAtLeast(entitlement, "coach_ai");
}

export const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: "Solo Coach",
  coach: "Coach",
  coach_ai: "Coach AI",
};

export const TIER_PRICE: Record<SubscriptionTier, { month: number | null; year: number | null }> = {
  free: { month: 0, year: 0 },
  coach: { month: 9, year: 99 },
  coach_ai: { month: 25, year: 200 },
};
