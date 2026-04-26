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
 * Compute the owner's current seat ledger. `used` excludes Coach+
 * collaborators (they pay their own way) and the owner themselves.
 * Returns zero-everything for owners not on Coach+ — seats only matter
 * for paying owners.
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
      ? "You need a Team Coach plan to add collaborators."
      : `You're at your seat limit (${usage.included + usage.purchased} seat${usage.included + usage.purchased === 1 ? "" : "s"} in use). Add a seat or remove an existing collaborator.`,
  };
}

export type SeatCollaborator = {
  userId: string;
  displayName: string | null;
  email: string | null;
  playbookCount: number;
};

/**
 * List the collaborators currently consuming seats for the given owner —
 * distinct active non-owner members of the owner's playbooks whose own
 * tier is below Coach. Returns an empty list for non-paying owners.
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
    .neq("role", "owner");

  const playbookCountByUser = new Map<string, number>();
  for (const r of memberRows ?? []) {
    const uid = r.user_id as string;
    if (uid === ownerId) continue;
    playbookCountByUser.set(uid, (playbookCountByUser.get(uid) ?? 0) + 1);
  }
  const candidateUserIds = Array.from(playbookCountByUser.keys());
  if (candidateUserIds.length === 0) return [];

  // Filter out Coach+ collaborators (free seats), then enrich with profile/email.
  const { data: entRows } = await admin
    .from("user_entitlements")
    .select("user_id, tier")
    .in("user_id", candidateUserIds);
  const tierByUser = new Map<string, string>();
  for (const r of entRows ?? []) {
    tierByUser.set(r.user_id as string, (r.tier as string | null) ?? "free");
  }
  const seatedUserIds = candidateUserIds.filter(
    (uid) => (tierByUser.get(uid) ?? "free") === "free",
  );
  if (seatedUserIds.length === 0) return [];

  const profileResult = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", seatedUserIds);
  const nameByUser = new Map<string, string | null>();
  for (const r of profileResult.data ?? []) {
    nameByUser.set(r.id as string, (r.display_name as string | null) ?? null);
  }
  const emailByUser = new Map<string, string | null>();
  await Promise.all(
    seatedUserIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      if (data?.user) emailByUser.set(uid, data.user.email ?? null);
    }),
  );

  return seatedUserIds
    .map((uid) => ({
      userId: uid,
      displayName: nameByUser.get(uid) ?? null,
      email: emailByUser.get(uid) ?? null,
      playbookCount: playbookCountByUser.get(uid) ?? 0,
    }))
    .sort((a, b) => (a.displayName ?? a.email ?? "").localeCompare(b.displayName ?? b.email ?? ""));
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
