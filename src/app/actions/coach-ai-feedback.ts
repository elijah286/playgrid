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

// ─── Admin: list refusals ────────────────────────────────────────────────────

export type RefusalRow = {
  id: string;
  user_request: string;
  refusal_reason: string;
  playbook_id: string | null;
  sport_variant: string | null;
  sanctioning_body: string | null;
  game_level: string | null;
  age_division: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function listCoachAiRefusalsAction(
  reviewedFilter: "unreviewed" | "all" = "unreviewed",
): Promise<{ ok: true; items: RefusalRow[] } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase
    .from("coach_ai_refusals")
    .select("id, user_request, refusal_reason, playbook_id, sport_variant, sanctioning_body, game_level, age_division, reviewed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (reviewedFilter === "unreviewed") q = q.is("reviewed_at", null);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []) as RefusalRow[] };
}

export async function setRefusalReviewedAction(
  id: string,
  reviewed: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_ai_refusals")
    .update({ reviewed_at: reviewed ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteRefusalAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("coach_ai_refusals").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── User feedback: thumbs up/down on responses ────────────────────────────

/**
 * Log positive feedback (thumbs up) on a Coach AI response.
 * This reinforces the knowledge base and helps us understand what's valuable.
 */
export async function logCoachAiPositiveFeedbackAction(
  response_text: string,
  user_message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true }; // Silent fail for anon users

  try {
    const { error } = await supabase.from("coach_ai_positive_feedback").insert({
      user_id: user.id,
      response_text: response_text.slice(0, 5000),
      user_message: user_message.slice(0, 5000),
      created_at: new Date().toISOString(),
    });
    if (error) return { ok: true }; // Don't fail the chat on logging error
    return { ok: true };
  } catch {
    return { ok: true }; // Silent fail
  }
}

/**
 * Log negative feedback (thumbs down) on a Coach AI response.
 * Helps identify problematic responses for analysis.
 */
export async function logCoachAiNegativeFeedbackAction(
  response_text: string,
  user_message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true }; // Silent fail for anon users

  try {
    const { error } = await supabase.from("coach_ai_negative_feedback").insert({
      user_id: user.id,
      response_text: response_text.slice(0, 5000),
      user_message: user_message.slice(0, 5000),
      created_at: new Date().toISOString(),
    });
    if (error) return { ok: true }; // Don't fail the chat on logging error
    return { ok: true };
  } catch {
    return { ok: true }; // Silent fail
  }
}

// ─── Admin: view positive/negative feedback ────────────────────────────────

export type PositiveFeedbackRow = {
  id: string;
  response_text: string;
  user_message: string;
  created_at: string;
};

export type NegativeFeedbackRow = {
  id: string;
  response_text: string;
  user_message: string;
  created_at: string;
};

export async function listCoachAiPositiveFeedbackAction(): Promise<
  { ok: true; items: PositiveFeedbackRow[] } | { ok: false; error: string }
> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_ai_positive_feedback")
    .select("id, response_text, user_message, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []) as PositiveFeedbackRow[] };
}

export async function listCoachAiNegativeFeedbackAction(): Promise<
  { ok: true; items: NegativeFeedbackRow[] } | { ok: false; error: string }
> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_ai_negative_feedback")
    .select("id, response_text, user_message, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []) as NegativeFeedbackRow[] };
}
