"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./admin-guard";

/** Per-user opt-in status for AI feedback collection. */
export async function getAiFeedbackOptInAction(): Promise<
  { ok: true; status: "consenting" | "declined" | "unanswered" } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data, error } = await supabase
    .from("profiles")
    .select("ai_feedback_optin")
    .eq("id", user.id)
    .single();
  if (error) return { ok: false, error: error.message };
  const v = (data as { ai_feedback_optin: boolean | null }).ai_feedback_optin;
  return {
    ok: true,
    status: v === true ? "consenting" : v === false ? "declined" : "unanswered",
  };
}

export async function setAiFeedbackOptInAction(
  consenting: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase
    .from("profiles")
    .update({ ai_feedback_optin: consenting })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Admin: list KB misses ────────────────────────────────────────────────

export type KbMissRow = {
  id: string;
  topic: string;
  user_question: string;
  reason: string;
  playbook_id: string | null;
  sport_variant: string | null;
  sanctioning_body: string | null;
  game_level: string | null;
  age_division: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function listCoachAiKbMissesAction(
  reviewedFilter: "unreviewed" | "all" = "unreviewed",
): Promise<{ ok: true; items: KbMissRow[] } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase
    .from("coach_ai_kb_misses")
    .select("id, topic, user_question, reason, playbook_id, sport_variant, sanctioning_body, game_level, age_division, reviewed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (reviewedFilter === "unreviewed") q = q.is("reviewed_at", null);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []) as KbMissRow[] };
}

export async function setKbMissReviewedAction(
  id: string,
  reviewed: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_ai_kb_misses")
    .update({ reviewed_at: reviewed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteKbMissAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("coach_ai_kb_misses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
