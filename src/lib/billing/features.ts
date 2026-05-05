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

/** Playsheet watermark (tiled XO Gridmaker logo) is shown for free owners. Coach+ removes it. */
export function canRemovePlaysheetWatermark(entitlement: Entitlement | null): boolean {
  return tierAtLeast(entitlement, "coach");
}

/** Free tier caps. Owner tier-driven unless noted. The per-playbook play
 *  cap is admin-configurable at runtime (see lib/site/free-plays-config);
 *  this constant is the hardcoded fallback when site_settings is unreadable. */
export const FREE_MAX_PLAYS_PER_PLAYBOOK = 16;
export const FREE_MAX_PLAYBOOKS_OWNED = 1;

export function canCreateAnotherPlaybook(
  entitlement: Entitlement | null,
  ownedCount: number,
): boolean {
  if (tierAtLeast(entitlement, "coach")) return true;
  return ownedCount < FREE_MAX_PLAYBOOKS_OWNED;
}

export function canAddAnotherPlay(
  ownerEntitlement: Entitlement | null,
  currentPlayCount: number,
  limit: number = FREE_MAX_PLAYS_PER_PLAYBOOK,
): boolean {
  if (tierAtLeast(ownerEntitlement, "coach")) return true;
  return currentPlayCount < limit;
}

/** Duplicating a playbook is allowed for free users *as long as* they have an
 *  open playbook slot — the duplicate consumes the same one-playbook quota
 *  as a fresh create or an example claim. Coach+ has no cap. Pass the
 *  caller's current owned-count (excluding the default starter book and
 *  archived/example tiles) so this stays the single source of truth. */
export function canDuplicatePlaybook(
  entitlement: Entitlement | null,
  ownedCount: number,
): boolean {
  if (tierAtLeast(entitlement, "coach")) return true;
  return ownedCount < FREE_MAX_PLAYBOOKS_OWNED;
}

/** Coach-collaboration features: inviting other coaches as editors,
 *  sending playbook copies, practice plans, and any feature that depends
 *  on a shared, multi-coach workspace. Coach+ only.
 *
 *  NOTE: as of 2026-05-04 this no longer gates the calendar or player
 *  invites — those moved to the free tier so a solo coach can run the
 *  team's schedule and roster without paying. The "team features" name
 *  is preserved because it's still the right semantic for the things
 *  it gates today (assistant coaches, send-copy, practice plans). When
 *  adding a new gate, prefer a feature-specific predicate below. */
export function canUseTeamFeatures(entitlement: Entitlement | null): boolean {
  return tierAtLeast(entitlement, "coach");
}

/** Inviting another coach to collaborate on a playbook (role=editor) and
 *  sending a playbook copy to another user are Coach+ features. Inviting
 *  players (role=viewer) is free for everyone. */
export function canInviteCoachCollaborators(
  entitlement: Entitlement | null,
): boolean {
  return tierAtLeast(entitlement, "coach");
}

/** Calendar (events, RSVPs, ICS feed) is free for every coach so a solo
 *  coach can run their team's schedule without paying. Provided as a
 *  predicate for symmetry; today this is unconditional. */
export function canUseCalendar(_entitlement: Entitlement | null): boolean {
  return true;
}

/** Inviting players (role=viewer) to view the playbook and receive
 *  schedule + game-day comms is free for every coach, no cap. */
export function canInvitePlayers(_entitlement: Entitlement | null): boolean {
  return true;
}

/** Game Mode: sideline play view with outcome tracking. Coach+ only — free
 *  users see an upgrade prompt instead of entering the flow. */
export function canUseGameMode(entitlement: Entitlement | null): boolean {
  return tierAtLeast(entitlement, "coach");
}

/** AI features (placeholder — not yet implemented). Coach AI only. */
export function canUseAiFeatures(entitlement: Entitlement | null): boolean {
  return tierAtLeast(entitlement, "coach_ai");
}

export const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: "Solo Coach",
  coach: "Team Coach",
  coach_ai: "Coach Pro",
};

export const TIER_PRICE: Record<SubscriptionTier, { month: number | null; year: number | null }> = {
  free: { month: 0, year: 0 },
  coach: { month: 9, year: 99 },
  coach_ai: { month: 25, year: 250 },
};
