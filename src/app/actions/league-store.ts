"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";

export type StoreItemRow = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  required: boolean;
  active: boolean;
};

export type StoreItemInput = {
  name: string;
  description?: string | null;
  priceCents: number;
  required?: boolean;
  active?: boolean;
};

async function gateAdmin(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  return { ok: true as const, supabase };
}

function fields(input: StoreItemInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price_cents: Math.max(0, Math.trunc(input.priceCents || 0)),
    required: !!input.required,
    active: input.active === undefined ? true : !!input.active,
  };
}

export async function listStoreItemsAction(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured.", items: [] as StoreItemRow[] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("league_store_items")
    .select("id, name, description, price_cents, required, active")
    .eq("league_id", leagueId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false as const, error: error.message, items: [] as StoreItemRow[] };
  const items: StoreItemRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    priceCents: (r.price_cents as number) ?? 0,
    required: !!r.required,
    active: !!r.active,
  }));
  return { ok: true as const, items };
}

export async function createStoreItemAction(leagueId: string, input: StoreItemInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const f = fields(input);
  if (!f.name) return { ok: false as const, error: "Item name is required." };
  const { error } = await gate.supabase.from("league_store_items").insert({ league_id: leagueId, ...f });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/registration`);
  return { ok: true as const };
}

export async function updateStoreItemAction(leagueId: string, id: string, input: StoreItemInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const f = fields(input);
  if (!f.name) return { ok: false as const, error: "Item name is required." };
  const { error } = await gate.supabase
    .from("league_store_items")
    .update(f)
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/registration`);
  return { ok: true as const };
}

export async function deleteStoreItemAction(leagueId: string, id: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { error } = await gate.supabase
    .from("league_store_items")
    .delete()
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/registration`);
  return { ok: true as const };
}
