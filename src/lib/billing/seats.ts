import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import { tierAtLeast } from "@/lib/billing/features";

/** Default seats included with Team Coach. Owners can also be granted more
 *  via the `owner_seat_grants.included_seats` column (e.g. comp/PR
 *  arrangements). Per-seat add-ons live in `purchased_seats`. */
export const DEFAULT_INCLUDED_SEATS = 3;
/** USD price per extra seat per month. Single source of truth for UI copy
 *  and any docs that mention the number. */
export const SEAT_PRICE_USD_PER_MONTH = 3;

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

/** Ensure the owner has a row in owner_seat_grants (idempotent). Used by
 *  Stripe webhook when first activating a Coach subscription, and by the
 *  admin tools that grant comp seats. */
export async function ensureOwnerSeatGrantRow(ownerId: string): Promise<void> {
  const admin = createServiceRoleClient();
  await admin
    .from("owner_seat_grants")
    .upsert({ owner_id: ownerId }, { onConflict: "owner_id", ignoreDuplicates: true });
}
