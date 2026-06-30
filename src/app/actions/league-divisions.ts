"use server";

import { revalidatePath } from "next/cache";

import { gateLeagueCapability } from "@/lib/league/authorize";
import { seedStandardDivisions } from "@/lib/league/divisions";
import {
  type DivisionAgeGroup,
  type DivisionGender,
  isDivisionAgeGroup,
  isDivisionGender,
  segmentSortOrder,
  standardDivisionName,
} from "@/lib/league/divisionCatalog";

export type DivisionRow = {
  id: string;
  name: string;
  gender: DivisionGender;
  /** Canonical age band (e.g. "10U") for standard divisions; null for custom. */
  ageGroup: string | null;
  active: boolean;
  minBirthdate: string | null;
  maxBirthdate: string | null;
  maxRosterSize: number | null;
  sortOrder: number;
};

export type DivisionInput = {
  name: string;
  gender?: DivisionGender;
  ageGroup?: string | null;
  active?: boolean;
  minBirthdate?: string | null;
  maxBirthdate?: string | null;
  maxRosterSize?: number | null;
};

// Division reads + edits require manage_teams (owners always have it). The gate
// returns the right client — cookie (RLS) for owners, service-role for
// grant-authorized members — so the actions act through gate.supabase.
function gateAdmin(leagueId: string) {
  return gateLeagueCapability(leagueId, "manage_teams");
}

function clean(input: DivisionInput) {
  const name = input.name.trim();
  const ageGroup = input.ageGroup?.trim() || null;
  return {
    name,
    gender: isDivisionGender(input.gender) ? input.gender : "coed",
    age_group: ageGroup,
    active: input.active ?? true,
    min_birthdate: input.minBirthdate?.trim() || null,
    max_birthdate: input.maxBirthdate?.trim() || null,
    max_roster_size:
      input.maxRosterSize === undefined || input.maxRosterSize === null || Number.isNaN(input.maxRosterSize)
        ? null
        : Math.max(0, Math.trunc(input.maxRosterSize)),
  };
}

export async function listDivisionsAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return { ok: false as const, error: gate.error, items: [] as DivisionRow[] };
  const supabase = gate.supabase;
  const { data, error } = await supabase
    .from("league_divisions")
    .select("id, name, gender, age_group, active, min_birthdate, max_birthdate, max_roster_size, sort_order")
    .eq("league_id", leagueId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false as const, error: error.message, items: [] as DivisionRow[] };
  const items: DivisionRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    gender: isDivisionGender(r.gender) ? r.gender : "coed",
    ageGroup: (r.age_group as string | null) ?? null,
    active: (r.active as boolean | null) ?? true,
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

  const supabase = gate.supabase;
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

  const supabase = gate.supabase;
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
  const supabase = gate.supabase;
  const { error } = await supabase
    .from("league_divisions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/divisions`);
  return { ok: true as const };
}

/** Flip a single division active/inactive for the current season. */
export async function setDivisionActiveAction(leagueId: string, id: string, active: boolean) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const supabase = gate.supabase;
  const { error } = await supabase
    .from("league_divisions")
    .update({ active })
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/divisions`);
  return { ok: true as const };
}

/** Seed the standard Co-ed set (idempotent) — the divisions page recovery CTA. */
export async function seedStandardDivisionsAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { error, inserted } = await seedStandardDivisions(leagueId, gate.supabase);
  if (error) return { ok: false as const, error };
  revalidatePath(`/league/${leagueId}/divisions`);
  return { ok: true as const, inserted };
}

/**
 * Toggle one cell of the standard Gender × Age grid. Turning a segment ON
 * reactivates an existing (possibly inactive) row or creates it; turning it OFF
 * sets active=false but keeps the row, so its birthdate window / roster cap and
 * any rostered teams survive a mid-season toggle. Archiving (true delete) stays
 * an explicit, separate action.
 */
export async function setStandardDivisionAction(
  leagueId: string,
  ageGroup: DivisionAgeGroup,
  gender: DivisionGender,
  on: boolean,
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  if (!isDivisionAgeGroup(ageGroup) || !isDivisionGender(gender)) {
    return { ok: false as const, error: "Unknown division segment." };
  }
  const supabase = gate.supabase;

  const { data: existing } = await supabase
    .from("league_divisions")
    .select("id, active")
    .eq("league_id", leagueId)
    .eq("gender", gender)
    .eq("age_group", ageGroup)
    .is("archived_at", null)
    .maybeSingle();

  if (existing) {
    if ((existing.active as boolean) === on) return { ok: true as const };
    const { error } = await supabase
      .from("league_divisions")
      .update({ active: on })
      .eq("id", existing.id as string)
      .eq("league_id", leagueId);
    if (error) return { ok: false as const, error: error.message };
  } else if (on) {
    const { error } = await supabase.from("league_divisions").insert({
      league_id: leagueId,
      name: standardDivisionName(ageGroup, gender),
      gender,
      age_group: ageGroup,
      active: true,
      sort_order: segmentSortOrder(ageGroup, gender),
    });
    if (error) return { ok: false as const, error: error.message };
  }
  // Turning OFF a segment that doesn't exist is a no-op.

  revalidatePath(`/league/${leagueId}/divisions`);
  return { ok: true as const };
}
