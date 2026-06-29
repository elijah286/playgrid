// Curriculum tools for Leo — registered in lockstep with the league curriculum
// feature. list is a read; distribute is consequential (approval-gated). Both
// reuse the SAME shared core as the action (curriculum-distribute.ts), so the
// rules live in one place.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  distributePracticePlan,
  listOperatorPracticePlans,
} from "@/lib/league/curriculum-distribute";
import type { LeagueTool, LeagueToolResult } from "./types";

const listCurriculum: LeagueTool = {
  kind: "read",
  def: {
    name: "list_curriculum_plans",
    description:
      "List the operator's own practice plans (with ids) that can be shared with the league's coaches. Use to find a plan to distribute.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  handler: async (_input, ctx): Promise<LeagueToolResult> => {
    const admin = createServiceRoleClient();
    const plans = await listOperatorPracticePlans(admin, ctx.userId);
    if (plans.length === 0) {
      return { ok: true, result: "You have no practice plans yet — build one in your playbook first." };
    }
    const lines = plans.map(
      (p) =>
        `"${p.title}" [id:${p.id}] — ${p.totalDurationMinutes} min, ${p.blockCount} blocks (in ${p.playbookName})`,
    );
    return { ok: true, result: `${plans.length} practice plan(s): ${lines.join("; ")}.` };
  },
};

const distribute: LeagueTool = {
  kind: "consequential",
  def: {
    name: "distribute_practice_plan",
    description:
      "Share one of the operator's practice plans with EVERY team's coach in this league (copies it into each team's playbook). CONSEQUENTIAL — requires approval. Provide the plan id from list_curriculum_plans.",
    input_schema: {
      type: "object",
      properties: { planId: { type: "string" } },
      required: ["planId"],
    },
  },
  handler: async (input, ctx): Promise<LeagueToolResult> => {
    if (!ctx.isLeagueAdmin) {
      return { ok: false, error: "Only a league admin can distribute practice plans." };
    }
    const planId = String(input.planId ?? "").trim();
    if (!planId) return { ok: false, error: "Provide a planId." };
    const admin = createServiceRoleClient();
    const r = await distributePracticePlan(admin, {
      leagueId: ctx.leagueId,
      sourcePlanId: planId,
      operatorId: ctx.userId,
    });
    if (!r.ok) return { ok: false, error: r.error };
    const skipped = r.skippedNoPlaybook > 0 ? ` (${r.skippedNoPlaybook} skipped — no playbook yet)` : "";
    return {
      ok: true,
      result: `Shared "${r.title}" with ${r.distributed} of ${r.teamsTotal} team(s)${skipped}.`,
    };
  },
};

export const CURRICULUM_TOOLS: LeagueTool[] = [listCurriculum, distribute];
