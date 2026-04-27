import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import { tierAtLeast } from "@/lib/billing/features";
import { DEFAULT_INCLUDED_SEATS, SEAT_PRICE_USD_PER_MONTH } from "@/lib/billing/seats-config";

export { DEFAULT_INCLUDED_SEATS, SEAT_PRICE_USD_PER_MONTH };

export type SeatUsage = {
  used: number;
  included: number;
  purchased: number;
  available: number;
};

/**
 * Compute the owner's current seat ledger. `used` counts only editor
 * (coach) collaborators below Coach tier — players (viewer) and Coach+
 * paying collaborators ride free. Returns zero-everything for owners
 * not on Coach+ — seats only matter for paying owners.
 */
export async function getSeatUsage(ownerId: string): Promise<SeatUsage> {
  const ownerEntitlement = await getUserEntitlement(ownerId);
  if (!tierAtLeast(ownerEntitlement, "coach")) {
    return { used: 0, included: 0, purchased: 0, available: 0 };
  }

  const admin = createServiceRoleClient();
  const [grantResult, usedResult] = await Promise.all([
    admin
      .from("owner_seat_grants")
      .select("included_seats, purchased_seats")
      .eq("owner_id", ownerId)
      .maybeSingle(),
    admin.rpc("seats_used", { p_owner_id: ownerId }),
  ]);

  const included = (grantResult.data?.included_seats as number | null) ?? DEFAULT_INCLUDED_SEATS;
  const purchased = (grantResult.data?.purchased_seats as number | null) ?? 0;
  const used = (usedResult.data as number | null) ?? 0;
  const available = Math.max(0, included + purchased - used);
  return { used, included, purchased, available };
}

/**
 * Guard: would adding `count` collaborators (each below Coach tier) push
 * the owner over their seat cap? Returns ok=true if there's room. The
 * caller is responsible for inviting Coach+ users without checking
 * (they're free seats).
 */
export async function ensureSeatsAvailable(
  ownerId: string,
  count: number = 1,
): Promise<{ ok: true; usage: SeatUsage } | { ok: false; usage: SeatUsage; error: string }> {
  const usage = await getSeatUsage(ownerId);
  if (usage.available >= count) return { ok: true, usage };
  return {
    ok: false,
    usage,
    error: usage.included + usage.purchased === 0
      ? "You need a Team Coach plan to add another coach."
      : `Coach seat limit reached (${usage.included + usage.purchased} of ${usage.included + usage.purchased} in use). Add a seat or remove a coach in Account → Coach seats.`,
  };
}

export type SeatCollaborator = {
  userId: string;
  displayName: string | null;
  email: string | null;
  playbookCount: number;
  /** Owner's playbook IDs this user is a member of (non-owner). Used by
   *  the /account UI to deep-link to the right playbook for management. */
  playbookIds: string[];
  /** Whether this coach is consuming one of the owner's seats. False when
   *  the coach has their own paid plan (Coach+ tier rides free). */
  consumesSeat: boolean;
};

/**
 * List every coach with edit access on the owner's playbooks, flagged
 * with whether each consumes a seat. Coach+ tier collaborators ride
 * free (consumesSeat=false) so the UI can list them separately. Returns
 * an empty list for non-paying owners.
 */
export async function getSeatCollaborators(
  ownerId: string,
): Promise<SeatCollaborator[]> {
  const ownerEntitlement = await getUserEntitlement(ownerId);
  if (!tierAtLeast(ownerEntitlement, "coach")) return [];

  const admin = createServiceRoleClient();
  // Owner's playbooks, then memberships on those playbooks.
  const { data: ownedRows } = await admin
    .from("playbook_members")
    .select("playbook_id")
    .eq("user_id", ownerId)
    .eq("role", "owner")
    .eq("status", "active");
  const ownedIds = (ownedRows ?? []).map((r) => r.playbook_id as string);
  if (ownedIds.length === 0) return [];

  const { data: memberRows } = await admin
    .from("playbook_members")
    .select("user_id, playbook_id")
    .in("playbook_id", ownedIds)
    .eq("status", "active")
    .eq("role", "editor");

  const playbooksByUser = new Map<string, string[]>();
  for (const r of memberRows ?? []) {
    const uid = r.user_id as string;
    if (uid === ownerId) continue;
    const list = playbooksByUser.get(uid) ?? [];
    list.push(r.playbook_id as string);
    playbooksByUser.set(uid, list);
  }
  const userIds = Array.from(playbooksByUser.keys());
  if (userIds.length === 0) return [];

  const { data: entRows } = await admin
    .from("user_entitlements")
    .select("user_id, tier")
    .in("user_id", userIds);
  const tierByUser = new Map<string, string>();
  for (const r of entRows ?? []) {
    tierByUser.set(r.user_id as string, (r.tier as string | null) ?? "free");
  }

  const profileResult = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  const nameByUser = new Map<string, string | null>();
  for (const r of profileResult.data ?? []) {
    nameByUser.set(r.id as string, (r.display_name as string | null) ?? null);
  }
  const emailByUser = new Map<string, string | null>();
  await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      if (data?.user) emailByUser.set(uid, data.user.email ?? null);
    }),
  );

  return userIds
    .map((uid) => {
      const ids = playbooksByUser.get(uid) ?? [];
      const tier = tierByUser.get(uid) ?? "free";
      return {
        userId: uid,
        displayName: nameByUser.get(uid) ?? null,
        email: emailByUser.get(uid) ?? null,
        playbookCount: ids.length,
        playbookIds: ids,
        consumesSeat: tier === "free",
      };
    })
    .sort((a, b) => (a.displayName ?? a.email ?? "").localeCompare(b.displayName ?? b.email ?? ""));
}

export type PendingCoachInvite = {
  inviteId: string;
  playbookId: string;
  playbookName: string;
  email: string | null;
  token: string;
  createdAt: string;
  expiresAt: string;
};

/**
 * Pending coach invites the owner has issued (role=editor, not yet
 * accepted/revoked/expired) across all their playbooks. Powers the
 * "Resend" affordance on the /account seats card.
 */
export async function getPendingCoachInvites(
  ownerId: string,
): Promise<PendingCoachInvite[]> {
  const ownerEntitlement = await getUserEntitlement(ownerId);
  if (!tierAtLeast(ownerEntitlement, "coach")) return [];

  const admin = createServiceRoleClient();
  const { data: ownedRows } = await admin
    .from("playbook_members")
    .select("playbook_id")
    .eq("user_id", ownerId)
    .eq("role", "owner")
    .eq("status", "active");
  const ownedIds = (ownedRows ?? []).map((r) => r.playbook_id as string);
  if (ownedIds.length === 0) return [];

  const nowIso = new Date().toISOString();
  const { data: inviteRows } = await admin
    .from("playbook_invites")
    .select("id, playbook_id, email, token, created_at, expires_at, max_uses, uses_count, revoked_at, role")
    .in("playbook_id", ownedIds)
    .eq("role", "editor")
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  // An invite with uses_count > 0 has already been accepted by someone;
  // even if max_uses=null left it "live" by the database, the recipient
  // is now an active member and the row should not show as pending.
  const live = (inviteRows ?? []).filter((r) => {
    if (!r.email) return false;
    const used = (r.uses_count as number | null) ?? 0;
    if (used > 0) return false;
    const max = r.max_uses as number | null;
    return max === null || used < max;
  });
  if (live.length === 0) return [];

  const { data: pbRows } = await admin
    .from("playbooks")
    .select("id, name")
    .in("id", Array.from(new Set(live.map((r) => r.playbook_id as string))));
  const nameByPb = new Map<string, string>();
  for (const r of pbRows ?? []) nameByPb.set(r.id as string, (r.name as string) ?? "Untitled");

  return live.map((r) => ({
    inviteId: r.id as string,
    playbookId: r.playbook_id as string,
    playbookName: nameByPb.get(r.playbook_id as string) ?? "Untitled",
    email: (r.email as string | null) ?? null,
    token: r.token as string,
    createdAt: r.created_at as string,
    expiresAt: r.expires_at as string,
  }));
}

/** Ensure the owner has a row in owner_seat_grants (idempotent). Used by
 *  Stripe webhook when first activating a Coach subscription, and by the
 *  admin tools that grant comp seats. */
export async function ensureOwnerSeatGrantRow(ownerId: string): Promise<void> {
  const admin = createServiceRoleClient();
  await admin
    .from("owner_seat_grants")
    .upsert({ owner_id: ownerId }, { onConflict: "owner_id", ignoreDuplicates: true });
}
