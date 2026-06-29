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
      .select("name, head_coach_name, head_coach_email")
      .eq("league_id", ctx.leagueId)
      .order("name", { ascending: true });
    const rows = data ?? [];
    if (rows.length === 0) return { ok: true, result: "No teams yet." };
    const lines = rows.map((t) => {
      const coach = (t.head_coach_name as string | null) || (t.head_coach_email as string | null);
      return `${t.name} — ${coach ? `coach ${coach}` : "no coach yet"}`;
    });
    return { ok: true, result: `${rows.length} team(s): ${lines.join("; ")}.` };
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

export const ROSTER_TOOLS: LeagueTool[] = [listRegistrations, listTeams, setRegistrationStatus];
