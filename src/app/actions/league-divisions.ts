"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";

export type DivisionRow = {
  id: string;
  name: string;
  minBirthdate: string | null;
  maxBirthdate: string | null;
  maxRosterSize: number | null;
  sortOrder: number;
};

export type DivisionInput = {
  name: string;
  minBirthdate?: string | null;
  maxBirthdate?: string | null;
  maxRosterSize?: number | null;
};

// Writes are additionally guarded by RLS (is_league_admin); this gives a clean
// error before the round-trip and keeps non-admins out.
async function gateAdmin(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  return { ok: true as const };
}

function clean(input: DivisionInput) {
  const name = input.name.trim();
  return {
    name,
    min_birthdate: input.minBirthdate?.trim() || null,
    max_birthdate: input.maxBirthdate?.trim() || null,
    max_roster_size:
      input.maxRosterSize === undefined || input.maxRosterSize === null || Number.isNaN(input.maxRosterSize)
        ? null
        : Math.max(0, Math.trunc(input.maxRosterSize)),
  };
}

export async function listDivisionsAction(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured.", items: [] as DivisionRow[] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("league_divisions")
    .select("id, name, min_birthdate, max_birthdate, max_roster_size, sort_order")
    .eq("league_id", leagueId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false as const, error: error.message, items: [] as DivisionRow[] };
  const items: DivisionRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    minBirthdate: (r.min_birthdate as string | null) ?? null,
    maxBirthdate: (r.max_birthdate as string | null) ?? null,
    maxRosterSize: (r.max_roster_size as number | null) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
  }));
  return { ok: true as const, items };
}

export async function createDivisionAction(leagueId: string, input: DivisionInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const fields = clean(input);
  if (!fields.name) return { ok: false as const, error: "Division name is required." };
  if (fields.min_birthdate && fields.max_birthdate && fields.min_birthdate > fields.max_birthdate) {
    return { ok: false as const, error: "Earliest birthdate must be on or before the latest birthdate." };
  }

  const supabase = await createClient();
  // Append to the end of the current ordering.
  const { data: last } = await supabase
    .from("league_divisions")
    .select("sort_order")
    .eq("league_id", leagueId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((last?.sort_order as number | undefined) ?? 0) + 1;

  const { error } = await supabase
    .from("league_divisions")
    .insert({ league_id: leagueId, sort_order: nextSort, ...fields });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/divisions`);
  return { ok: true as const };
}

export async function updateDivisionAction(leagueId: string, id: string, input: DivisionInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const fields = clean(input);
  if (!fields.name) return { ok: false as const, error: "Division name is required." };
  if (fields.min_birthdate && fields.max_birthdate && fields.min_birthdate > fields.max_birthdate) {
    return { ok: false as const, error: "Earliest birthdate must be on or before the latest birthdate." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("league_divisions")
    .update(fields)
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/divisions`);
  return { ok: true as const };
}

export async function archiveDivisionAction(leagueId: string, id: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase
    .from("league_divisions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/divisions`);
  return { ok: true as const };
}
