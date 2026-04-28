"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  EMPTY_PRACTICE_PLAN_DOCUMENT,
  PRACTICE_PLAN_SCHEMA_VERSION,
  type PracticePlanDocument,
} from "@/domain/practice-plan/types";

export type PracticePlanRow = {
  id: string;
  playbook_id: string;
  title: string;
  description: string;
  current_version_id: string | null;
  total_duration_minutes: number;
  block_count: number;
  updated_at: string;
};

type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function getUserId(): Promise<string | null> {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

export async function listPracticePlansAction(
  playbookId: string,
): Promise<ActionResult<{ plans: PracticePlanRow[] }>> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("practice_plans")
    .select("id, playbook_id, title, description, current_version_id, updated_at")
    .eq("playbook_id", playbookId)
    .is("retired_at", null)
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  // Fetch current version documents in one batch to derive duration + block count.
  const versionIds = (data ?? [])
    .map((p) => p.current_version_id)
    .filter((v): v is string => Boolean(v));
  let docByVersion: Record<string, PracticePlanDocument> = {};
  if (versionIds.length > 0) {
    const { data: versions } = await sb
      .from("practice_plan_versions")
      .select("id, document")
      .in("id", versionIds);
    docByVersion = Object.fromEntries(
      (versions ?? []).map((v) => [v.id as string, v.document as PracticePlanDocument]),
    );
  }

  const plans: PracticePlanRow[] = (data ?? []).map((p) => {
    const doc = p.current_version_id ? docByVersion[p.current_version_id] : null;
    return {
      id: p.id as string,
      playbook_id: p.playbook_id as string,
      title: p.title as string,
      description: (p.description as string) ?? "",
      current_version_id: (p.current_version_id as string | null) ?? null,
      total_duration_minutes: doc?.totalDurationMinutes ?? 0,
      block_count: doc?.blocks.length ?? 0,
      updated_at: p.updated_at as string,
    };
  });

  return { ok: true, plans };
}

export async function createPracticePlanAction(
  playbookId: string,
  title: string,
): Promise<ActionResult<{ planId: string }>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Not authenticated" };
  const sb = await createClient();

  const cleanTitle = title.trim().slice(0, 200) || "Untitled practice plan";

  const { data: plan, error: insErr } = await sb
    .from("practice_plans")
    .insert({
      playbook_id: playbookId,
      title: cleanTitle,
      description: "",
      created_by: userId,
    })
    .select("id")
    .single();
  if (insErr || !plan) return { ok: false, error: insErr?.message ?? "Insert failed" };

  // Seed an initial empty version so the editor has something to load.
  const initialDoc: PracticePlanDocument = { ...EMPTY_PRACTICE_PLAN_DOCUMENT };
  const { data: version, error: vErr } = await sb
    .from("practice_plan_versions")
    .insert({
      practice_plan_id: plan.id,
      schema_version: PRACTICE_PLAN_SCHEMA_VERSION,
      document: initialDoc,
      label: "Created",
      author_type: "human",
      created_by: userId,
    })
    .select("id")
    .single();
  if (vErr || !version) return { ok: false, error: vErr?.message ?? "Version insert failed" };

  await sb
    .from("practice_plans")
    .update({ current_version_id: version.id })
    .eq("id", plan.id);

  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true, planId: plan.id as string };
}

export async function savePracticePlanVersionAction(
  planId: string,
  document: PracticePlanDocument,
  options?: { label?: string; note?: string; authorType?: "human" | "ai"; authorPrompt?: string },
): Promise<ActionResult<{ versionId: string }>> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Not authenticated" };
  const sb = await createClient();

  const { data: version, error: vErr } = await sb
    .from("practice_plan_versions")
    .insert({
      practice_plan_id: planId,
      schema_version: PRACTICE_PLAN_SCHEMA_VERSION,
      document,
      label: options?.label ?? null,
      note: options?.note ?? null,
      author_type: options?.authorType ?? "human",
      author_prompt: options?.authorPrompt ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (vErr || !version) return { ok: false, error: vErr?.message ?? "Version insert failed" };

  const { error: uErr } = await sb
    .from("practice_plans")
    .update({ current_version_id: version.id })
    .eq("id", planId);
  if (uErr) return { ok: false, error: uErr.message };

  return { ok: true, versionId: version.id as string };
}

export async function getPracticePlanAction(
  planId: string,
): Promise<
  ActionResult<{
    plan: PracticePlanRow;
    document: PracticePlanDocument;
  }>
> {
  const sb = await createClient();
  const { data: plan, error: pErr } = await sb
    .from("practice_plans")
    .select("id, playbook_id, title, description, current_version_id, updated_at")
    .eq("id", planId)
    .is("retired_at", null)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!plan) return { ok: false, error: "Practice plan not found" };

  let doc: PracticePlanDocument = { ...EMPTY_PRACTICE_PLAN_DOCUMENT };
  if (plan.current_version_id) {
    const { data: version } = await sb
      .from("practice_plan_versions")
      .select("document")
      .eq("id", plan.current_version_id)
      .maybeSingle();
    if (version?.document) doc = version.document as PracticePlanDocument;
  }

  return {
    ok: true,
    plan: {
      id: plan.id as string,
      playbook_id: plan.playbook_id as string,
      title: plan.title as string,
      description: (plan.description as string) ?? "",
      current_version_id: (plan.current_version_id as string | null) ?? null,
      total_duration_minutes: doc.totalDurationMinutes,
      block_count: doc.blocks.length,
      updated_at: plan.updated_at as string,
    },
    document: doc,
  };
}

export async function renamePracticePlanAction(
  planId: string,
  title: string,
): Promise<ActionResult<{ planId: string }>> {
  const sb = await createClient();
  const cleanTitle = title.trim().slice(0, 200) || "Untitled practice plan";
  const { error } = await sb
    .from("practice_plans")
    .update({ title: cleanTitle })
    .eq("id", planId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, planId };
}

export async function deletePracticePlanAction(
  planId: string,
): Promise<ActionResult<{ planId: string }>> {
  const sb = await createClient();
  const { error } = await sb
    .from("practice_plans")
    .update({ retired_at: new Date().toISOString() })
    .eq("id", planId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, planId };
}

// Avoid unused-warning when service role is referenced from elsewhere.
void createServiceRoleClient;
