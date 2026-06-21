import { createServiceRoleClient } from "@/lib/supabase/admin";

export type PublicStoreItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  required: boolean;
};

export type PublicRegistrationData = {
  leagueId: string;
  leagueName: string;
  isOpen: boolean;
  closedReason: "not_started" | "ended" | "closed" | null;
  feeCents: number;
  storeItems: PublicStoreItem[];
};

function computeOpen(
  win: { is_open: boolean; opens_at: string | null; closes_at: string | null } | null,
): { open: boolean; reason: PublicRegistrationData["closedReason"] } {
  if (!win || !win.is_open) return { open: false, reason: "closed" };
  const now = Date.now();
  if (win.opens_at && now < new Date(win.opens_at).getTime()) {
    return { open: false, reason: "not_started" };
  }
  if (win.closes_at && now > new Date(win.closes_at).getTime()) {
    return { open: false, reason: "ended" };
  }
  return { open: true, reason: null };
}

/**
 * Public, anonymous-safe read for the parent registration page. Uses the
 * service role (server-only) to fetch the league's registration config + active
 * store catalog without exposing any RLS write surface. Returns null if the
 * league doesn't exist.
 */
export async function getPublicRegistration(
  leagueId: string,
): Promise<PublicRegistrationData | null> {
  const admin = createServiceRoleClient();

  const { data: league } = await admin
    .from("leagues")
    .select("id, name")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) return null;

  const { data: win } = await admin
    .from("registration_windows")
    .select("is_open, opens_at, closes_at, fee_cents")
    .eq("league_id", leagueId)
    .is("division_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: items } = await admin
    .from("league_store_items")
    .select("id, name, description, price_cents, required")
    .eq("league_id", leagueId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const { open, reason } = computeOpen(
    win as { is_open: boolean; opens_at: string | null; closes_at: string | null } | null,
  );

  return {
    leagueId: league.id as string,
    leagueName: league.name as string,
    isOpen: open,
    closedReason: reason,
    feeCents: (win?.fee_cents as number) ?? 0,
    storeItems: (items ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      priceCents: (r.price_cents as number) ?? 0,
      required: !!r.required,
    })),
  };
}
