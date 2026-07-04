"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { gateLeagueCapability, resolveLeagueView } from "@/lib/league/authorize";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import { autoSeedNewTeam } from "@/lib/league/team-playbook";

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

// Team + coach writes require manage_teams (owners always have it).
function gateAdmin(leagueId: string) {
  return gateLeagueCapability(leagueId, "manage_teams");
}

export async function listLeagueTeamsAction(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured.", items: [] as LeagueTeamRow[] };
  // Grant-aware read: a member reads via RLS; a delegated member with manage_teams
  // reads via the service role. No access → empty (as an RLS read would be).
  const access = await resolveLeagueView(leagueId, { delegateCapability: "manage_teams" });
  if (!access) return { ok: true as const, items: [] as LeagueTeamRow[] };
  const supabase = access.db;
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

  const { data: created, error } = await gate.supabase
    .from("teams")
    .insert({
      org_id: orgId,
      league_id: leagueId,
      ...fields,
    })
    .select("id, name")
    .single();
  if (error || !created) return { ok: false as const, error: error?.message ?? "Insert failed." };

  // New teams get their playbook immediately: starter plays + the operator's
  // library defaults for this game type (library plan, Phase 2). Best-effort —
  // the team exists even if seeding hiccups; warnings surface in the UI.
  let warnings: string[] = [];
  try {
    const seeded = await autoSeedNewTeam(createServiceRoleClient(), {
      leagueId,
      teamId: created.id as string,
      teamName: created.name as string,
      userId: gate.userId,
    });
    warnings = seeded.warnings;
  } catch (e) {
    warnings = [e instanceof Error ? e.message : "Playbook seeding failed."];
  }

  revalidatePath(`/league/${leagueId}/teams`);
  revalidatePath(`/league/${leagueId}/playbooks`);
  return { ok: true as const, warnings };
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

// Standings are derived from final games, so deleting a team's games deletes
// the opponent's results too. The FK is ON DELETE RESTRICT (20260701140000);
// this message is the friendly face of that constraint.
function blockedByGamesError(count?: number) {
  const games =
    typeof count === "number"
      ? `${count} recorded game${count === 1 ? "" : "s"}`
      : "recorded games";
  return {
    ok: false as const,
    error: `This team has ${games}. Delete its games/scores first, then delete the team.`,
  };
}

export async function deleteLeagueTeamAction(leagueId: string, teamId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;

  // Mirror the DB constraint before deleting so the operator gets an
  // explanation instead of a raw FK violation.
  const { count, error: gamesError } = await gate.supabase
    .from("league_games")
    .select("id", { count: "exact", head: true })
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
  if (gamesError) return { ok: false as const, error: gamesError.message };
  if ((count ?? 0) > 0) return blockedByGamesError(count ?? 0);

  // Scoped to league teams only (never a coach team).
  const { error } = await gate.supabase
    .from("teams")
    .delete()
    .eq("id", teamId)
    .eq("league_id", leagueId);
  if (error) {
    // A game recorded between the check and the delete trips the FK (23503).
    if (error.code === "23503") return blockedByGamesError();
    return { ok: false as const, error: error.message };
  }
  revalidatePath(`/league/${leagueId}/teams`);
  return { ok: true as const };
}
