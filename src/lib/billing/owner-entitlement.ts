import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCurrentEntitlement, getUserEntitlement, type Entitlement } from "./entitlement";
import { tierAtLeast } from "./features";

/**
 * Resolve the user whose plan a playbook's features bill against.
 *
 * Normal coach playbooks: the playbook_members row with role="owner".
 * League team playbooks deliberately have NO owner-member row (seeding keeps
 * them out of the operator's personal quota — see league-playbooks.ts), so
 * they fall back to the league operator: playbook → team → league →
 * leagues.created_by. That one fallback is what makes every owner-keyed gate
 * (play cap, seats, the feature blend below) treat a league playbook as
 * running on the operator's plan (library plan, Phase 3).
 */
export async function getPlaybookOwnerId(playbookId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", playbookId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  const memberOwner = (data?.user_id as string | null) ?? null;
  if (memberOwner) return memberOwner;

  const { data: pb } = await admin
    .from("playbooks")
    .select("team_id, teams!inner(league_id, leagues(created_by))")
    .eq("id", playbookId)
    .maybeSingle();
  const team = pb?.teams as
    | { league_id: string | null; leagues: { created_by: string } | null }
    | null
    | undefined;
  if (!team?.league_id) return null;
  return (team.leagues?.created_by as string | null) ?? null;
}

/**
 * Returns the entitlement of the playbook's owner (owner member, or the
 * league operator for org-owned league team playbooks). Free invitees of a
 * Coach+ owner inherit the owner's unlocked features. Returns a free-tier
 * entitlement if the owner can't be resolved — safer than leaking features.
 */
export async function getPlaybookOwnerEntitlement(
  playbookId: string,
): Promise<Entitlement | null> {
  const ownerId = await getPlaybookOwnerId(playbookId);
  if (!ownerId) return null;
  return getUserEntitlement(ownerId);
}

/**
 * The entitlement that gates PLAYBOOK-SCOPED features (game mode, wristbands,
 * watermark removal, team affordances) for the current viewer on this
 * playbook: the better of the viewer's own plan and the playbook owner's.
 * A free coach on a paying owner's playbook — an invited assistant, or a
 * league coach on an operator-seat team playbook — gets the owner's features
 * THERE, while their own playbooks stay on their own plan. Coach Cal is NOT
 * gated through this — it stays per-user by design (library plan, Phase 3).
 */
export async function getPlaybookFeatureEntitlement(
  playbookId: string,
): Promise<Entitlement | null> {
  const [viewer, owner] = await Promise.all([
    getCurrentEntitlement(),
    getPlaybookOwnerEntitlement(playbookId),
  ]);
  if (!owner) return viewer;
  if (!viewer) return owner;
  return tierAtLeast(viewer, owner.tier) ? viewer : owner;
}
