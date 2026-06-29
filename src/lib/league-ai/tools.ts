// Leo's tool registry. Mirrors Coach Cal's tool framework (tools.ts:
// CoachAiTool + toolsFor + runTool) but for the league domain. Each league
// workflow appends its tools here in lockstep as it's built.
//
// Seeded with READ tools (no approval needed) that already answer the brief's
// "administrative assistant" use case (Agent 5: "which players aren't
// rostered?", "which teams have no coach?"). Consequential write tools
// (create_team, assign_player, send_announcement, …) get added per workflow and
// MUST be kind:"consequential" so they route through human approval.

import type { ToolDef } from "@/lib/coach-ai/llm";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { LeagueTool, LeagueToolContext, LeagueToolResult } from "./types";
import { COMMS_TOOLS } from "./comms-tools";
import { GROUP_TOOLS } from "./group-tools";
import { SETTINGS_TOOLS } from "./settings-tools";

function playerName(applicant: unknown): string {
  const a = (applicant ?? {}) as { player?: { firstName?: unknown; lastName?: unknown } };
  const first = typeof a.player?.firstName === "string" ? a.player.firstName : "";
  const last = typeof a.player?.lastName === "string" ? a.player.lastName : "";
  return `${first} ${last}`.trim() || "Unnamed player";
}

const leagueOverviewTool: LeagueTool = {
  kind: "read",
  def: {
    name: "league_overview",
    description:
      "Snapshot of the current league: sport, team count (and how many lack a head coach), division count, registrations by status, and how many approved players still need a team. Call this to answer 'what's the state of my league?' or before recommending actions.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  handler: async (_input, ctx): Promise<LeagueToolResult> => {
    const admin = createServiceRoleClient();
    const { data: league } = await admin
      .from("leagues")
      .select("name, sport")
      .eq("id", ctx.leagueId)
      .maybeSingle();
    if (!league) return { ok: false, error: "League not found." };

    const [teamsR, divsR, regsR] = await Promise.all([
      admin.from("teams").select("id, head_coach_email").eq("league_id", ctx.leagueId),
      admin.from("league_divisions").select("id").eq("league_id", ctx.leagueId),
      admin.from("player_registrations").select("status").eq("league_id", ctx.leagueId),
    ]);
    const teams = teamsR.data ?? [];
    const regs = regsR.data ?? [];
    const teamsNoCoach = teams.filter((t) => !t.head_coach_email).length;
    const byStatus: Record<string, number> = {};
    for (const r of regs) byStatus[r.status as string] = (byStatus[r.status as string] ?? 0) + 1;
    const unrostered = (byStatus.approved ?? 0) + (byStatus.waitlisted ?? 0);

    const statusStr =
      Object.entries(byStatus)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ") || "none";
    return {
      ok: true,
      result:
        `League "${league.name}" — sport: ${league.sport}. ` +
        `${teams.length} teams (${teamsNoCoach} without a head coach), ${divsR.data?.length ?? 0} divisions. ` +
        `Registrations: ${regs.length} total (${statusStr}). ` +
        `${unrostered} approved/waitlisted players still need a team.`,
    };
  },
};

const listUnrosteredTool: LeagueTool = {
  kind: "read",
  def: {
    name: "list_unrostered_players",
    description:
      "List approved (and waitlisted) players who have not yet been assigned to a team, by name. Use to answer 'who still needs a team?' before recommending roster assignments.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  handler: async (_input, ctx): Promise<LeagueToolResult> => {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("player_registrations")
      .select("applicant, status")
      .eq("league_id", ctx.leagueId)
      .in("status", ["approved", "waitlisted"])
      .limit(500);
    const rows = data ?? [];
    if (rows.length === 0) return { ok: true, result: "Every approved player has a team." };
    const names = rows.map(
      (r) => playerName(r.applicant) + (r.status === "waitlisted" ? " (waitlisted)" : ""),
    );
    return { ok: true, result: `${names.length} players need a team: ${names.join(", ")}.` };
  },
};

/** The registry. Workflows append their tools here in lockstep. */
export const LEAGUE_TOOLS: LeagueTool[] = [
  leagueOverviewTool,
  listUnrosteredTool,
  // Communications (first workflow registered under the AI-readiness convention).
  ...COMMS_TOOLS,
  // League groups + cross-league messaging.
  ...GROUP_TOOLS,
  // Per-league settings (rename + registration-link slug).
  ...SETTINGS_TOOLS,
];

/** Tools available for this context. Consequential tools (added later) gate on
 *  ctx.isLeagueAdmin here; read tools are always available to an authorized member. */
export function leagueToolsFor(ctx: LeagueToolContext): LeagueTool[] {
  return LEAGUE_TOOLS.filter((t) => t.kind === "read" || ctx.isLeagueAdmin);
}

export function leagueToolDefs(ctx: LeagueToolContext): ToolDef[] {
  return leagueToolsFor(ctx).map((t) => t.def);
}

/**
 * Read-only tool defs — Leo v1 exposes ONLY these, so the assistant can never
 * call a write tool. Consequential tools stay in the registry for the v2
 * approval-chip flow; they're simply never offered to the model in v1.
 */
export function leagueReadToolDefs(): ToolDef[] {
  return LEAGUE_TOOLS.filter((t) => t.kind === "read").map((t) => t.def);
}

/** Names of the read tools — the runner refuses any tool_use not in this set
 *  (defense in depth alongside leagueReadToolDefs). */
export const LEAGUE_READ_TOOL_NAMES: ReadonlySet<string> = new Set(
  LEAGUE_TOOLS.filter((t) => t.kind === "read").map((t) => t.def.name),
);

export async function runLeagueTool(
  name: string,
  input: Record<string, unknown>,
  ctx: LeagueToolContext,
): Promise<LeagueToolResult> {
  // Dispatch from the full registry (not the filtered list) so a misuse of a
  // gated tool returns a clear reason rather than "unknown".
  const tool = LEAGUE_TOOLS.find((t) => t.def.name === name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  // Consequential tools are admin-only AND (per the convention) must be routed
  // through human approval by the agent runner before reaching here.
  if (tool.kind === "consequential" && !ctx.isLeagueAdmin) {
    return { ok: false, error: "That action requires a league admin." };
  }
  try {
    return await tool.handler(input, ctx);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tool error." };
  }
}
