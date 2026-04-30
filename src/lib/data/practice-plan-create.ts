// Practice-plan creation logic, callable from both server actions and from
// non-action server contexts (the Coach AI `create_practice_plan` tool).
//
// Following the same pattern as playbook-create.ts: a 'use server' module
// can't be safely required from an API route in Next.js 16 / Turbopack, so
// we keep the actual DB writes here in a plain helper that any caller can
// invoke directly.

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  EMPTY_PRACTICE_PLAN_DOCUMENT,
  PRACTICE_PLAN_SCHEMA_VERSION,
  computeTotalDurationMinutes,
  type BlockLane,
  type PracticePlanDocument,
  type TimeBlock,
} from "@/domain/practice-plan/types";

export type CreatePracticePlanLaneInput = {
  /** Lane label (e.g. "Skill", "Line"). Optional for single-lane blocks. */
  title?: string;
  /** Coaching notes / activity description. */
  notes?: string;
};

export type CreatePracticePlanBlockInput = {
  /** Block label, e.g. "Warm-up", "Individual", "Team install". */
  title: string;
  /** Duration in minutes — required, ≥ 1. */
  durationMinutes: number;
  /** Optional explicit start offset in minutes. If omitted, blocks are
   *  laid out sequentially by order. */
  startOffsetMinutes?: number;
  /** Plain-text coaching notes for the block (shown next to the block). */
  notes?: string;
  /** Optional 1–3 parallel lanes inside this block. If omitted, a single
   *  lane is auto-created from the block title + notes. */
  lanes?: CreatePracticePlanLaneInput[];
};

export type CreatePracticePlanInput = {
  playbookId: string;
  /** Plan title, e.g. "Tuesday — Install + Special Teams". */
  title: string;
  /** Optional plan-level notes shown above the timeline. */
  notes?: string;
  /** Optional age tier — used to bias content guidance. */
  ageTier?: PracticePlanDocument["ageTier"];
  /** Optional initial blocks. If omitted, the plan starts empty (the
   *  coach can fill it in via the editor). */
  blocks?: CreatePracticePlanBlockInput[];
};

export type CreatePracticePlanResult =
  | { ok: true; planId: string; totalDurationMinutes: number; blockCount: number }
  | { ok: false; error: string };

/**
 * Build a PracticePlanDocument from a plain block list. Sets orderIndex
 * and computes startOffsetMinutes when not supplied (sequential layout).
 */
export function buildPracticePlanDocument(
  blocks: CreatePracticePlanBlockInput[],
  opts?: { ageTier?: PracticePlanDocument["ageTier"]; notes?: string },
): PracticePlanDocument {
  let runningOffset = 0;
  const builtBlocks: TimeBlock[] = blocks.map((b, i) => {
    const startOffset = typeof b.startOffsetMinutes === "number"
      ? Math.max(0, Math.round(b.startOffsetMinutes))
      : runningOffset;
    const duration = Math.max(1, Math.round(b.durationMinutes || 0));
    runningOffset = startOffset + duration;

    const laneInputs = b.lanes && b.lanes.length > 0
      ? b.lanes.slice(0, 3)
      : [{ title: "", notes: b.notes ?? "" }];
    const lanes: BlockLane[] = laneInputs.map((lane, j) => ({
      id: randomUUID(),
      orderIndex: j,
      title: (lane.title ?? "").trim().slice(0, 80),
      notes: (lane.notes ?? "").trim().slice(0, 2000),
      diagram: null,
    }));

    return {
      id: randomUUID(),
      orderIndex: i,
      startOffsetMinutes: startOffset,
      durationMinutes: duration,
      title: (b.title || "Block").trim().slice(0, 120),
      notes: (b.notes ?? "").trim().slice(0, 2000),
      lanes,
    };
  });

  return {
    schemaVersion: PRACTICE_PLAN_SCHEMA_VERSION,
    totalDurationMinutes: computeTotalDurationMinutes(builtBlocks),
    ageTier: opts?.ageTier ?? null,
    notes: opts?.notes ?? "",
    blocks: builtBlocks,
  };
}

/**
 * Create a practice plan and seed its initial version document. The
 * supabase client must already be authenticated (cookie-bound for the
 * acting coach, or service-role for system contexts).
 */
export async function createPracticePlanForUser(
  supabase: SupabaseClient,
  input: CreatePracticePlanInput,
): Promise<CreatePracticePlanResult> {
  const playbookId = input.playbookId?.trim() ?? "";
  if (!playbookId) return { ok: false, error: "playbookId is required." };
  const cleanTitle = (input.title ?? "").trim().slice(0, 200) || "Untitled practice plan";

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const initialDoc = input.blocks && input.blocks.length > 0
    ? buildPracticePlanDocument(input.blocks, { ageTier: input.ageTier ?? null, notes: input.notes })
    : { ...EMPTY_PRACTICE_PLAN_DOCUMENT, ageTier: input.ageTier ?? null, notes: input.notes ?? "" };

  const { data: plan, error: insErr } = await supabase
    .from("practice_plans")
    .insert({
      playbook_id: playbookId,
      title: cleanTitle,
      description: "",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insErr || !plan?.id) {
    return { ok: false, error: insErr?.message ?? "Practice plan insert failed." };
  }

  const { data: version, error: vErr } = await supabase
    .from("practice_plan_versions")
    .insert({
      practice_plan_id: plan.id,
      schema_version: PRACTICE_PLAN_SCHEMA_VERSION,
      document: initialDoc,
      label: input.blocks && input.blocks.length > 0 ? "Created by Coach Cal" : "Created",
      author_type: input.blocks && input.blocks.length > 0 ? "ai" : "human",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (vErr || !version?.id) {
    return { ok: false, error: vErr?.message ?? "Practice plan version insert failed." };
  }

  const { error: uErr } = await supabase
    .from("practice_plans")
    .update({ current_version_id: version.id })
    .eq("id", plan.id);
  if (uErr) return { ok: false, error: `Could not link version: ${uErr.message}` };

  // Verify the row is readable before returning success.
  const { data: verify, error: verifyErr } = await supabase
    .from("practice_plans")
    .select("id")
    .eq("id", plan.id)
    .single();
  if (verifyErr || !verify?.id) {
    return { ok: false, error: "Practice plan insert could not be verified." };
  }

  return {
    ok: true,
    planId: plan.id as string,
    totalDurationMinutes: initialDoc.totalDurationMinutes,
    blockCount: initialDoc.blocks.length,
  };
}
