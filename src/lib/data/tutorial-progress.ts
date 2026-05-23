import { createClient } from "@/lib/supabase/server";
import type { SportVariant } from "@/domain/play/types";
import type {
  TutorialId,
  TutorialProgressRow,
  TutorialStatus,
} from "@/features/tutorials/engine/types";

/**
 * Tutorial progress data layer.
 *
 * Lives in `src/lib/data/*` so it can be imported by both server actions
 * AND any future API routes — server-action "use server" exports are not
 * safe to require from API routes on Next 16 / Turbopack.
 */

const ALL_TUTORIAL_IDS: ReadonlyArray<TutorialId> = [
  "play_authoring_v1",
  "defense_v1",
  "formations_v1",
  "practice_plan_v1",
  "game_mode_v1",
];

export async function listTutorialProgress(): Promise<TutorialProgressRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_tutorial_progress")
    .select("tutorial_id, status, step_index, variant")
    .eq("user_id", user.id);
  if (error || !data) return [];

  return data.map((row) => ({
    tutorialId: row.tutorial_id as TutorialId,
    status: row.status as TutorialStatus,
    stepIndex: row.step_index ?? 0,
    variant: (row.variant as SportVariant | null) ?? null,
  }));
}

export async function getTutorialProgress(
  tutorialId: TutorialId,
): Promise<TutorialProgressRow | null> {
  if (!ALL_TUTORIAL_IDS.includes(tutorialId)) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_tutorial_progress")
    .select("tutorial_id, status, step_index, variant")
    .eq("user_id", user.id)
    .eq("tutorial_id", tutorialId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    tutorialId: data.tutorial_id as TutorialId,
    status: data.status as TutorialStatus,
    stepIndex: data.step_index ?? 0,
    variant: (data.variant as SportVariant | null) ?? null,
  };
}

export async function upsertTutorialProgress(input: {
  tutorialId: TutorialId;
  status: TutorialStatus;
  stepIndex: number;
  variant: SportVariant | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ALL_TUTORIAL_IDS.includes(input.tutorialId)) {
    return { ok: false, error: "Unknown tutorial id." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: user.id,
    tutorial_id: input.tutorialId,
    status: input.status,
    step_index: Math.max(0, Math.floor(input.stepIndex)),
    variant: input.variant,
    updated_at: now,
  };
  if (input.status === "in_progress") row.started_at = now;
  if (input.status === "completed") row.completed_at = now;

  const { error } = await supabase
    .from("user_tutorial_progress")
    .upsert(row, { onConflict: "user_id,tutorial_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
