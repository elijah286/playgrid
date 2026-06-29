// Registration-triage + team-visibility tools for Leo — the operator's daily
// work. Registered in lockstep. Reads run inline; set_registration_status is
// consequential (approval-gated). League-scoped via ctx.leagueId; the write
// self-gates on ctx.isLeagueAdmin and uses the service-role client like the
// other consequential tools (no session dependency inside the handler).

import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { LeagueTool, LeagueToolResult } from "./types";

// Statuses an operator can set from review (matches the registration UI; NOT
// "rostered", which is set by roster placement).
const SETTABLE_STATUSES = ["submitted", "approved", "waitlisted", "rejected", "withdrawn"] as const;

function playerName(applicant: unknown): string {
  const a = (applicant ?? {}) as { player?: { firstName?: unknown; lastName?: unknown } };
  const first = typeof a.player?.firstName === "string" ? a.player.firstName : "";
  const last = typeof a.player?.lastName === "string" ? a.player.lastName : "";
  return `${first} ${last}`.trim() || "Unnamed player";
}

const listRegistrations: LeagueTool = {
  kind: "read",
  def: {
    name: "list_registrations",
    description:
      "List player registrations with their id and status, optionally filtered by status (submitted = pending review, approved, waitlisted, rejected, withdrawn, rostered). Use to answer 'who's pending?' and to get the ids needed to approve/waitlist/reject players.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["submitted", "approved", "waitlisted", "rejected", "withdrawn", "rostered"],
          description: "Optional status filter. Omit to list all.",
        },
      },
      required: [],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    const status = typeof input.status === "string" ? input.status : null;
    const admin = createServiceRoleClient();
    let q = admin
      .from("player_registrations")
      .select("id, applicant, status")
      .eq("league_id", ctx.leagueId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (status) q = q.eq("status", status);
    const { data } = await q;
    const rows = data ?? [];
    if (rows.length === 0) {
      return { ok: true, result: status ? `No ${status} registrations.` : "No registrations yet." };
    }
    const lines = rows.map(
      (r) => `${playerName(r.applicant)} [id:${r.id}] — ${r.status}`,
    );
    return {
      ok: true,
      result: `${rows.length} registration(s)${status ? ` (${status})` : ""}: ${lines.join("; ")}.`,
    };
  },
};

const listTeams: LeagueTool = {
  kind: "read",
  def: {
    name: "list_teams",
    description:
      "List the league's teams with their head coach (or note that a team has no coach yet). Use to answer 'what teams do I have?' or 'which teams still need a coach?'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  handler: async (_input, ctx): Promise<LeagueToolResult> => {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("teams")
      .select("id, name, head_coach_name, head_coach_email")
      .eq("league_id", ctx.leagueId)
      .order("name", { ascending: true });
    const rows = data ?? [];
    if (rows.length === 0) return { ok: true, result: "No teams yet." };
    const lines = rows.map((t) => {
      const coach = (t.head_coach_name as string | null) || (t.head_coach_email as string | null);
      return `${t.name} [id:${t.id}] — ${coach ? `coach ${coach}` : "no coach yet"}`;
    });
    return { ok: true, result: `${rows.length} team(s): ${lines.join("; ")}.` };
  },
};

const createTeams: LeagueTool = {
  kind: "consequential",
  def: {
    name: "create_teams",
    description:
      "Create one or more teams in this league by name (divisions and coaches can be set afterward). CONSEQUENTIAL — requires approval.",
    input_schema: {
      type: "object",
      properties: { names: { type: "array", items: { type: "string" } } },
      required: ["names"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    if (!ctx.isLeagueAdmin) return { ok: false, error: "Only a league admin can create teams." };
    const names = Array.isArray(input.names)
      ? input.names.map((x) => String(x).trim()).filter(Boolean).slice(0, 50)
      : [];
    if (names.length === 0) return { ok: false, error: "Provide at least one team name." };

    const admin = createServiceRoleClient();
    // Teams need the operator's workspace (org). The operator owns one already
    // (they created the league); we resolve it rather than create one here.
    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", ctx.userId)
      .limit(1)
      .maybeSingle();
    if (!org) return { ok: false, error: "No workspace found for your account." };

    const rows = names.map((name) => ({
      org_id: org.id as string,
      league_id: ctx.leagueId,
      name,
    }));
    const { data, error } = await admin.from("teams").insert(rows).select("id");
    if (error) return { ok: false, error: error.message };
    return { ok: true, result: `Created ${(data ?? []).length} team(s): ${names.join(", ")}.` };
  },
};

const assignTeamCoach: LeagueTool = {
  kind: "consequential",
  def: {
    name: "assign_team_coach",
    description:
      "Set (or clear) a team's head coach. Provide the team id (from list_teams) and the coach's name and/or email. CONSEQUENTIAL — requires approval.",
    input_schema: {
      type: "object",
      properties: {
        teamId: { type: "string" },
        coachName: { type: "string" },
        coachEmail: { type: "string" },
      },
      required: ["teamId"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    if (!ctx.isLeagueAdmin) return { ok: false, error: "Only a league admin can assign coaches." };
    const teamId = String(input.teamId ?? "").trim();
    if (!teamId) return { ok: false, error: "Provide the team id." };
    const coachName = input.coachName ? String(input.coachName).trim() : null;
    const coachEmail = input.coachEmail ? String(input.coachEmail).trim() : null;

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("teams")
      .update({ head_coach_name: coachName, head_coach_email: coachEmail })
      .eq("id", teamId)
      .eq("league_id", ctx.leagueId)
      .select("name");
    if (error) return { ok: false, error: error.message };
    if ((data ?? []).length === 0) return { ok: false, error: "Team not found in this league." };
    const coach = coachName || coachEmail;
    return {
      ok: true,
      result: coach
        ? `Set the head coach for ${data![0].name} to ${coach}.`
        : `Cleared the head coach for ${data![0].name}.`,
    };
  },
};

const setRegistrationStatus: LeagueTool = {
  kind: "consequential",
  def: {
    name: "set_registration_status",
    description:
      "Set the status of one or more registrations (e.g. approve pending players, or waitlist/reject). CONSEQUENTIAL — requires approval. Pass the registration ids (from list_registrations) and the new status.",
    input_schema: {
      type: "object",
      properties: {
        registrationIds: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: [...SETTABLE_STATUSES] },
      },
      required: ["registrationIds", "status"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    if (!ctx.isLeagueAdmin) {
      return { ok: false, error: "Only a league admin can change registration status." };
    }
    const status = String(input.status ?? "");
    if (!SETTABLE_STATUSES.includes(status as (typeof SETTABLE_STATUSES)[number])) {
      return { ok: false, error: `Invalid status. Use one of: ${SETTABLE_STATUSES.join(", ")}.` };
    }
    const ids = Array.isArray(input.registrationIds)
      ? input.registrationIds.map((x) => String(x)).filter(Boolean).slice(0, 200)
      : [];
    if (ids.length === 0) return { ok: false, error: "No registration ids provided." };

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("player_registrations")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("league_id", ctx.leagueId)
      .in("id", ids)
      .select("id");
    if (error) return { ok: false, error: error.message };
    const n = (data ?? []).length;
    return { ok: true, result: `Set ${n} registration(s) to ${status}.` };
  },
};

const placePlayersOnTeam: LeagueTool = {
  kind: "consequential",
  def: {
    name: "place_players_on_team",
    description:
      "Roster one or more APPROVED players onto a team. Provide the registration ids (from list_registrations) and the team id (from list_teams). Only approved players can be rostered. CONSEQUENTIAL — requires approval.",
    input_schema: {
      type: "object",
      properties: {
        registrationIds: { type: "array", items: { type: "string" } },
        teamId: { type: "string" },
      },
      required: ["registrationIds", "teamId"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    if (!ctx.isLeagueAdmin) return { ok: false, error: "Only a league admin can roster players." };
    const teamId = String(input.teamId ?? "").trim();
    const ids = Array.isArray(input.registrationIds)
      ? input.registrationIds.map((x) => String(x)).filter(Boolean).slice(0, 200)
      : [];
    if (!teamId || ids.length === 0) {
      return { ok: false, error: "Provide a teamId and at least one registrationId." };
    }

    const admin = createServiceRoleClient();
    const { data: team } = await admin
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .eq("league_id", ctx.leagueId)
      .maybeSingle();
    if (!team) return { ok: false, error: "That team isn't in this league." };

    // Mirror assignRegistrationToTeamAction's state machine: only an approved
    // player (or an orphaned rostered one with no team) may become rostered.
    const { data, error } = await admin
      .from("player_registrations")
      .update({ team_id: teamId, status: "rostered", decided_at: new Date().toISOString() })
      .eq("league_id", ctx.leagueId)
      .in("id", ids)
      .or("status.eq.approved,and(status.eq.rostered,team_id.is.null)")
      .select("id");
    if (error) return { ok: false, error: error.message };
    const n = (data ?? []).length;
    if (n === 0) {
      return {
        ok: false,
        error: "None of those players could be rostered — they must be approved first.",
      };
    }
    return { ok: true, result: `Placed ${n} player(s) on ${team.name}.` };
  },
};

const unassignPlayer: LeagueTool = {
  kind: "consequential",
  def: {
    name: "unassign_player",
    description:
      "Remove a rostered player from their team, returning them to the approved pool. Provide the registration id. CONSEQUENTIAL — requires approval.",
    input_schema: {
      type: "object",
      properties: { registrationId: { type: "string" } },
      required: ["registrationId"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    if (!ctx.isLeagueAdmin) return { ok: false, error: "Only a league admin can unassign players." };
    const registrationId = String(input.registrationId ?? "").trim();
    if (!registrationId) return { ok: false, error: "Provide the registration id." };

    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("player_registrations")
      .update({ team_id: null, status: "approved" })
      .eq("id", registrationId)
      .eq("league_id", ctx.leagueId)
      .eq("status", "rostered")
      .select("id");
    if (error) return { ok: false, error: error.message };
    if ((data ?? []).length === 0) return { ok: false, error: "That player isn't rostered." };
    return { ok: true, result: "Removed the player from their team (back to the approved pool)." };
  },
};

export const ROSTER_TOOLS: LeagueTool[] = [
  listRegistrations,
  listTeams,
  setRegistrationStatus,
  createTeams,
  assignTeamCoach,
  placePlayersOnTeam,
  unassignPlayer,
];
