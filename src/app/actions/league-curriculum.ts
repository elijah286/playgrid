"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";
import {
  distributePracticePlan,
  listOperatorPracticePlans,
  type CurriculumOverview,
} from "@/lib/league/curriculum-distribute";

export type { CurriculumPlan, CurriculumOverview } from "@/lib/league/curriculum-distribute";

async function gate(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  return { ok: true as const, userId: user.id };
}

export async function listLeagueCurriculumAction(
  leagueId: string,
): Promise<{ ok: true; data: CurriculumOverview } | { ok: false; error: string }> {
  const g = await gate(leagueId);
  if (!g.ok) return g;
  const admin = createServiceRoleClient();

  const plans = await listOperatorPracticePlans(admin, g.userId);

  // Team coverage — how many teams have a playbook to receive a distribution.
  const { data: teams } = await admin.from("teams").select("id").eq("league_id", leagueId);
  const teamIds = (teams ?? []).map((t) => t.id as string);
  let teamsWithPlaybook = 0;
  if (teamIds.length > 0) {
    const { data: pbs } = await admin.from("playbooks").select("team_id").in("team_id", teamIds);
    teamsWithPlaybook = new Set((pbs ?? []).map((p) => p.team_id as string)).size;
  }

  return { ok: true, data: { plans, teamsTotal: teamIds.length, teamsWithPlaybook } };
}

export async function distributePracticePlanToTeamsAction(leagueId: string, planId: string) {
  const g = await gate(leagueId);
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  return distributePracticePlan(admin, { leagueId, sourcePlanId: planId, operatorId: g.userId });
}
