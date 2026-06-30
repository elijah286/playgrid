"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { gateLeagueCapability } from "@/lib/league/authorize";

export type RosterPlayer = {
  registrationId: string;
  name: string;
  status: string;
  divisionPreference: string | null;
};

export type RosterTeam = {
  id: string;
  name: string;
  divisionName: string | null;
  players: RosterPlayer[];
};

export type RosterBoard = {
  teams: RosterTeam[];
  unrostered: RosterPlayer[];
  waitlistedCount: number;
};

function playerName(applicant: unknown): string {
  const a = (applicant ?? {}) as { player?: { firstName?: unknown; lastName?: unknown } };
  const first = typeof a.player?.firstName === "string" ? a.player.firstName : "";
  const last = typeof a.player?.lastName === "string" ? a.player.lastName : "";
  return `${first} ${last}`.trim() || "Unnamed player";
}

function divisionPref(applicant: unknown): string | null {
  const a = (applicant ?? {}) as { divisionPreference?: unknown };
  return typeof a.divisionPreference === "string" ? a.divisionPreference : null;
}

// Roster placement requires manage_rosters (owners always have it).
function gateAdmin(leagueId: string) {
  return gateLeagueCapability(leagueId, "manage_rosters");
}

export async function getRosterBoardAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return { ok: false as const, error: gate.error, board: null };
  const supabase = gate.supabase;

  const [teamsRes, divsRes, regsRes] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, league_division_id")
      .eq("league_id", leagueId)
      .order("name", { ascending: true }),
    supabase.from("league_divisions").select("id, name").eq("league_id", leagueId),
    supabase
      .from("player_registrations")
      .select("id, applicant, status, team_id")
      .eq("league_id", leagueId)
      .in("status", ["approved", "waitlisted", "rostered"])
      .order("submitted_at", { ascending: true })
      .limit(5000),
  ]);

  const divName = new Map<string, string>(
    (divsRes.data ?? []).map((d) => [d.id as string, d.name as string]),
  );

  const toPlayer = (r: { id: unknown; applicant: unknown; status: unknown }): RosterPlayer => ({
    registrationId: r.id as string,
    name: playerName(r.applicant),
    status: r.status as string,
    divisionPreference: divisionPref(r.applicant),
  });

  const regs = regsRes.data ?? [];
  // A player rostered onto a team that was later deleted lands in status
  // 'rostered' with team_id=null (ON DELETE SET NULL) — an orphan that belongs
  // to no team. Surface those in the needs-a-team list so they're recoverable.
  const isOrphan = (r: { status: unknown; team_id: unknown }) =>
    r.status === "rostered" && !r.team_id;

  const teams: RosterTeam[] = (teamsRes.data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    divisionName: t.league_division_id ? divName.get(t.league_division_id as string) ?? null : null,
    players: regs
      .filter((r) => r.status === "rostered" && r.team_id === t.id)
      .map(toPlayer),
  }));

  // Only 'approved' players are rosterable (the state machine forbids
  // waitlisted -> rostered; waitlisted are approved first in the review queue).
  // Orphans rejoin the queue too.
  const unrostered: RosterPlayer[] = regs
    .filter((r) => r.status === "approved" || isOrphan(r))
    .map(toPlayer);
  const waitlistedCount = regs.filter((r) => r.status === "waitlisted").length;

  return { ok: true as const, board: { teams, unrostered, waitlistedCount } as RosterBoard };
}

export async function assignRegistrationToTeamAction(
  leagueId: string,
  registrationId: string,
  teamId: string,
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;

  // The team must belong to this league.
  const { data: team } = await gate.supabase
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .eq("league_id", leagueId)
    .maybeSingle();
  if (!team) return { ok: false as const, error: "That team isn't in this league." };

  // Only an 'approved' player (or an orphan: previously rostered onto a now-
  // deleted team) may become rostered — the state machine forbids rostering a
  // submitted/waitlisted/rejected/withdrawn registration. The .select() lets us
  // detect a no-op (stale board) and report it instead of silently succeeding.
  const { data: updated, error } = await gate.supabase
    .from("player_registrations")
    .update({ team_id: teamId, status: "rostered", decided_at: new Date().toISOString() })
    .eq("id", registrationId)
    .eq("league_id", leagueId)
    .or("status.eq.approved,and(status.eq.rostered,team_id.is.null)")
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false as const,
      error: "That player can't be rostered right now — refresh the board and try again.",
    };
  }
  revalidatePath(`/league/${leagueId}/roster`);
  return { ok: true as const };
}

export async function unassignRegistrationAction(leagueId: string, registrationId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;

  // Only rostered players are unassigned; they return to the approved pool.
  const { data: updated, error } = await gate.supabase
    .from("player_registrations")
    .update({ team_id: null, status: "approved" })
    .eq("id", registrationId)
    .eq("league_id", leagueId)
    .eq("status", "rostered")
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false as const, error: "That player isn't currently rostered." };
  }
  revalidatePath(`/league/${leagueId}/roster`);
  return { ok: true as const };
}
