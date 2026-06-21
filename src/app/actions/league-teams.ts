"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";

export type LeagueTeamRow = {
  id: string;
  name: string;
  divisionId: string | null;
  headCoachName: string | null;
  headCoachEmail: string | null;
};

type Client = Awaited<ReturnType<typeof createClient>>;

async function operatorOrgId(supabase: Client, userId: string): Promise<string | undefined> {
  await ensureDefaultWorkspace(supabase, userId);
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? undefined;
}

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
  return { ok: true as const, supabase, userId: user.id };
}

export async function listLeagueTeamsAction(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured.", items: [] as LeagueTeamRow[] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, league_division_id, head_coach_name, head_coach_email")
    .eq("league_id", leagueId)
    .order("name", { ascending: true });
  if (error) return { ok: false as const, error: error.message, items: [] as LeagueTeamRow[] };
  const items: LeagueTeamRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    divisionId: (r.league_division_id as string | null) ?? null,
    headCoachName: (r.head_coach_name as string | null) ?? null,
    headCoachEmail: (r.head_coach_email as string | null) ?? null,
  }));
  return { ok: true as const, items };
}

export type LeagueTeamInput = {
  name: string;
  divisionId?: string | null;
  headCoachName?: string | null;
  headCoachEmail?: string | null;
};

function teamFields(input: LeagueTeamInput) {
  return {
    name: input.name.trim(),
    league_division_id: input.divisionId || null,
    head_coach_name: input.headCoachName?.trim() || null,
    head_coach_email: input.headCoachEmail?.trim() || null,
  };
}

export async function createLeagueTeamAction(leagueId: string, input: LeagueTeamInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const fields = teamFields(input);
  if (!fields.name) return { ok: false as const, error: "Team name is required." };

  const orgId = await operatorOrgId(gate.supabase, gate.userId);
  if (!orgId) return { ok: false as const, error: "No workspace found for your account." };

  const { error } = await gate.supabase.from("teams").insert({
    org_id: orgId,
    league_id: leagueId,
    ...fields,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/teams`);
  return { ok: true as const };
}

export async function updateLeagueTeamAction(
  leagueId: string,
  teamId: string,
  input: LeagueTeamInput,
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const fields = teamFields(input);
  if (!fields.name) return { ok: false as const, error: "Team name is required." };

  const { error } = await gate.supabase
    .from("teams")
    .update(fields)
    .eq("id", teamId)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/teams`);
  return { ok: true as const };
}

export async function deleteLeagueTeamAction(leagueId: string, teamId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;

  // Scoped to league teams only (never a coach team).
  const { error } = await gate.supabase
    .from("teams")
    .delete()
    .eq("id", teamId)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/teams`);
  return { ok: true as const };
}
