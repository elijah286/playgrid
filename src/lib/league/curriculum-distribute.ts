import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PRACTICE_PLAN_SCHEMA_VERSION } from "@/domain/practice-plan/types";

// Shared core for distributing a practice plan to every team in a league. Used
// by Leo's distribute tool (the Curriculum page merged into Playbooks —
// Phase 4). The rules (source ownership, one copy per team, self-contained
// document) live in one place. The caller passes a service-role client; the
// operatorId is the verified league admin acting.

export type DistributeResult =
  | {
      ok: true;
      title: string;
      distributed: number;
      teamsTotal: number;
      skippedNoPlaybook: number;
    }
  | { ok: false; error: string };

export type CurriculumPlan = {
  id: string;
  title: string;
  playbookName: string;
  totalDurationMinutes: number;
  blockCount: number;
};

export type CurriculumOverview = {
  plans: CurriculumPlan[];
  teamsTotal: number;
  teamsWithPlaybook: number;
};

/**
 * The operator's own practice plans (across the playbooks they're a member of) —
 * the distributable curriculum sources. Shared by the action and Leo's tool.
 */
export async function listOperatorPracticePlans(
  admin: SupabaseClient,
  operatorId: string,
): Promise<CurriculumPlan[]> {
  const { data: memberships } = await admin
    .from("playbook_members")
    .select("playbook_id")
    .eq("user_id", operatorId);
  const pbIds = [...new Set((memberships ?? []).map((m) => m.playbook_id as string))];
  if (pbIds.length === 0) return [];

  const [{ data: pbs }, { data: planRows }] = await Promise.all([
    admin.from("playbooks").select("id, name").in("id", pbIds),
    admin
      .from("practice_plans")
      .select("id, title, playbook_id, current_version_id")
      .in("playbook_id", pbIds)
      .is("retired_at", null)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);
  const nameById = new Map((pbs ?? []).map((p) => [p.id as string, p.name as string]));

  const versionIds = (planRows ?? [])
    .map((p) => p.current_version_id as string | null)
    .filter((x): x is string => !!x);
  const docById = new Map<string, { totalDurationMinutes?: number; blocks?: unknown[] }>();
  if (versionIds.length > 0) {
    const { data: versions } = await admin
      .from("practice_plan_versions")
      .select("id, document")
      .in("id", versionIds);
    for (const v of versions ?? []) {
      docById.set(v.id as string, (v.document ?? {}) as { totalDurationMinutes?: number; blocks?: unknown[] });
    }
  }

  return (planRows ?? []).map((p) => {
    const doc = p.current_version_id ? docById.get(p.current_version_id as string) : undefined;
    return {
      id: p.id as string,
      title: (p.title as string) || "Untitled practice plan",
      playbookName: nameById.get(p.playbook_id as string) ?? "Playbook",
      totalDurationMinutes: typeof doc?.totalDurationMinutes === "number" ? doc.totalDurationMinutes : 0,
      blockCount: Array.isArray(doc?.blocks) ? doc.blocks!.length : 0,
    };
  });
}

async function copyPlanToPlaybook(
  admin: SupabaseClient,
  args: { document: unknown; targetPlaybookId: string; title: string; createdBy: string },
): Promise<boolean> {
  const { data: plan, error: e1 } = await admin
    .from("practice_plans")
    .insert({
      playbook_id: args.targetPlaybookId,
      title: args.title,
      description: "",
      created_by: args.createdBy,
    })
    .select("id")
    .single();
  if (e1 || !plan?.id) return false;

  const { data: version, error: e2 } = await admin
    .from("practice_plan_versions")
    .insert({
      practice_plan_id: plan.id,
      schema_version: PRACTICE_PLAN_SCHEMA_VERSION,
      document: args.document,
      label: "Shared by your league",
      author_type: "human",
      created_by: args.createdBy,
    })
    .select("id")
    .single();
  if (e2 || !version?.id) return false;

  await admin.from("practice_plans").update({ current_version_id: version.id }).eq("id", plan.id);
  return true;
}

export async function distributePracticePlan(
  admin: SupabaseClient,
  { leagueId, sourcePlanId, operatorId }: {
    leagueId: string;
    sourcePlanId: string;
    operatorId: string;
  },
): Promise<DistributeResult> {
  // 1. Load the source plan and verify the operator owns it (is a member of its
  //    playbook). Prevents distributing an arbitrary plan id via service-role.
  const { data: plan } = await admin
    .from("practice_plans")
    .select("id, title, playbook_id, current_version_id, retired_at")
    .eq("id", sourcePlanId)
    .maybeSingle();
  if (!plan || plan.retired_at) return { ok: false, error: "Practice plan not found." };

  const { data: membership } = await admin
    .from("playbook_members")
    .select("playbook_id")
    .eq("playbook_id", plan.playbook_id as string)
    .eq("user_id", operatorId)
    .maybeSingle();
  if (!membership) return { ok: false, error: "You can only distribute your own practice plans." };

  // 2. Load the current version document (self-contained — safe to copy as-is).
  if (!plan.current_version_id) return { ok: false, error: "That plan has no saved content yet." };
  const { data: version } = await admin
    .from("practice_plan_versions")
    .select("document")
    .eq("id", plan.current_version_id as string)
    .maybeSingle();
  if (!version?.document) return { ok: false, error: "That plan has no saved content yet." };
  const title = plan.title as string;

  // 3. Resolve one target playbook per team in the league.
  const { data: teams } = await admin.from("teams").select("id").eq("league_id", leagueId);
  const teamIds = (teams ?? []).map((t) => t.id as string);
  const teamsTotal = teamIds.length;
  if (teamsTotal === 0) return { ok: false, error: "This league has no teams yet." };

  const { data: playbooks } = await admin
    .from("playbooks")
    .select("id, team_id")
    .in("team_id", teamIds);
  const oneByTeam = new Map<string, string>();
  for (const p of playbooks ?? []) {
    const teamId = p.team_id as string;
    if (!oneByTeam.has(teamId)) oneByTeam.set(teamId, p.id as string);
  }
  const skippedNoPlaybook = teamsTotal - oneByTeam.size;

  // 4. Copy the plan into each team's playbook.
  let distributed = 0;
  for (const targetPlaybookId of oneByTeam.values()) {
    const ok = await copyPlanToPlaybook(admin, {
      document: version.document,
      targetPlaybookId,
      title,
      createdBy: operatorId,
    });
    if (ok) distributed += 1;
  }

  return { ok: true, title, distributed, teamsTotal, skippedNoPlaybook };
}
