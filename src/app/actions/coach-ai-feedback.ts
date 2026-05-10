"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./admin-guard";

/**
 * Resolve a set of user_ids to display info (email, display_name, role).
 * Returns a map keyed by id. Used by every admin list action so the table
 * rows show "from <email>" — the most-asked-for context per the
 * 2026-05-10 review of the AI Feedback page (the unidentified-rows
 * problem made it hard to tell coach pain from admin testing).
 *
 * Two trips: profiles (display_name, role — RLS-bypassed via service role)
 * and auth.users.listUsers (email — only available through the admin API).
 * listUsers paginates at perPage=1000; we fetch up to 1000 in one pass,
 * which covers the foreseeable user base. If we ever cross 1k users, the
 * function returns whatever it could fetch and the UI shows "(unknown)"
 * for users past the page boundary — a degraded but non-breaking failure.
 */
type UserInfo = {
  email: string | null;
  display_name: string | null;
  role: string | null;
};

async function resolveUserInfo(userIds: string[]): Promise<Map<string, UserInfo>> {
  const out = new Map<string, UserInfo>();
  if (userIds.length === 0) return out;
  const admin = createServiceRoleClient();
  const [{ data: profiles }, authRes] = await Promise.all([
    admin.from("profiles").select("id, display_name, role").in("id", userIds),
    admin.auth.admin.listUsers({ perPage: 1000, page: 1 }),
  ]);
  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      {
        display_name: (p as { display_name: string | null }).display_name,
        role: (p as { role: string | null }).role,
      },
    ]),
  );
  const emailById = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? null]),
  );
  for (const id of userIds) {
    const prof = profileById.get(id);
    out.set(id, {
      email: emailById.get(id) ?? null,
      display_name: prof?.display_name ?? null,
      role: prof?.role ?? null,
    });
  }
  return out;
}

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
  user_id: string | null;
  user_email: string | null;
  user_display_name: string | null;
  user_role: string | null;
};

export async function listCoachAiKbMissesAction(
  reviewedFilter: "unreviewed" | "all" = "unreviewed",
  excludeAdmins: boolean = true,
): Promise<{ ok: true; items: KbMissRow[] } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase
    .from("coach_ai_kb_misses")
    .select("id, topic, user_question, reason, playbook_id, sport_variant, sanctioning_body, game_level, age_division, reviewed_at, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (reviewedFilter === "unreviewed") q = q.is("reviewed_at", null);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Array<KbMissRow & { user_id: string | null }>;
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
  );
  const userInfoById = await resolveUserInfo(userIds);
  const enriched: KbMissRow[] = rows.map((r) => {
    const info = r.user_id ? userInfoById.get(r.user_id) : null;
    return {
      ...r,
      user_email: info?.email ?? null,
      user_display_name: info?.display_name ?? null,
      user_role: info?.role ?? null,
    };
  });
  const filtered = excludeAdmins
    ? enriched.filter((r) => r.user_role !== "admin")
    : enriched;
  return { ok: true, items: filtered };
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
  user_id: string | null;
  user_email: string | null;
  user_display_name: string | null;
  user_role: string | null;
};

export async function listCoachAiRefusalsAction(
  reviewedFilter: "unreviewed" | "all" = "unreviewed",
  excludeAdmins: boolean = true,
): Promise<{ ok: true; items: RefusalRow[] } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();
  let q = supabase
    .from("coach_ai_refusals")
    .select("id, user_request, refusal_reason, playbook_id, sport_variant, sanctioning_body, game_level, age_division, reviewed_at, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (reviewedFilter === "unreviewed") q = q.is("reviewed_at", null);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Array<RefusalRow & { user_id: string | null }>;
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
  );
  const userInfoById = await resolveUserInfo(userIds);
  const enriched: RefusalRow[] = rows.map((r) => {
    const info = r.user_id ? userInfoById.get(r.user_id) : null;
    return {
      ...r,
      user_email: info?.email ?? null,
      user_display_name: info?.display_name ?? null,
      user_role: info?.role ?? null,
    };
  });
  const filtered = excludeAdmins
    ? enriched.filter((r) => r.user_role !== "admin")
    : enriched;
  return { ok: true, items: filtered };
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
    // Check opt-in status
    const { data: profile } = await supabase
      .from("profiles")
      .select("ai_feedback_optin")
      .eq("id", user.id)
      .single();
    if (!profile?.ai_feedback_optin) return { ok: true }; // User hasn't opted in

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
    // Check opt-in status
    const { data: profile } = await supabase
      .from("profiles")
      .select("ai_feedback_optin")
      .eq("id", user.id)
      .single();
    if (!profile?.ai_feedback_optin) return { ok: true }; // User hasn't opted in

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
  user_id: string | null;
  user_email: string | null;
  user_display_name: string | null;
  user_role: string | null;
};

export type NegativeFeedbackRow = {
  id: string;
  response_text: string;
  user_message: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  user_display_name: string | null;
  user_role: string | null;
};

type EnrichedUserFields = {
  user_email: string | null;
  user_display_name: string | null;
  user_role: string | null;
};

async function listThumbsFeedback<T extends { user_id: string | null }>(
  table: "coach_ai_positive_feedback" | "coach_ai_negative_feedback",
  excludeAdmins: boolean,
): Promise<{ ok: true; items: Array<T & EnrichedUserFields> } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select("id, response_text, user_message, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Array<T>;
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
  );
  const userInfoById = await resolveUserInfo(userIds);
  const enriched: Array<T & EnrichedUserFields> = rows.map((r) => {
    const info = r.user_id ? userInfoById.get(r.user_id) : null;
    return {
      ...r,
      user_email: info?.email ?? null,
      user_display_name: info?.display_name ?? null,
      user_role: info?.role ?? null,
    };
  });
  const filtered = excludeAdmins
    ? enriched.filter((r) => r.user_role !== "admin")
    : enriched;
  return { ok: true, items: filtered };
}

export async function listCoachAiPositiveFeedbackAction(
  excludeAdmins: boolean = true,
): Promise<
  { ok: true; items: PositiveFeedbackRow[] } | { ok: false; error: string }
> {
  await requireAdmin();
  const res = await listThumbsFeedback<{
    id: string;
    response_text: string;
    user_message: string;
    created_at: string;
    user_id: string | null;
  }>("coach_ai_positive_feedback", excludeAdmins);
  if (!res.ok) return res;
  return { ok: true, items: res.items as unknown as PositiveFeedbackRow[] };
}

export async function listCoachAiNegativeFeedbackAction(
  excludeAdmins: boolean = true,
): Promise<
  { ok: true; items: NegativeFeedbackRow[] } | { ok: false; error: string }
> {
  await requireAdmin();
  const res = await listThumbsFeedback<{
    id: string;
    response_text: string;
    user_message: string;
    created_at: string;
    user_id: string | null;
  }>("coach_ai_negative_feedback", excludeAdmins);
  if (!res.ok) return res;
  return { ok: true, items: res.items as unknown as NegativeFeedbackRow[] };
}
