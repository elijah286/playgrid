import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";
const DEFAULT_EVAL_DAYS = 7;
const MIN_EVAL_DAYS = 1;
const MAX_EVAL_DAYS = 90;

export const COACH_AI_EVAL_DAYS_DEFAULT = DEFAULT_EVAL_DAYS;
export const COACH_AI_EVAL_DAYS_MIN = MIN_EVAL_DAYS;
export const COACH_AI_EVAL_DAYS_MAX = MAX_EVAL_DAYS;

function clamp(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_EVAL_DAYS;
  return Math.max(MIN_EVAL_DAYS, Math.min(MAX_EVAL_DAYS, Math.floor(n)));
}

export async function getCoachAiEvalDays(): Promise<number> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("coach_ai_eval_days")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error || !data) return DEFAULT_EVAL_DAYS;
    const raw = data.coach_ai_eval_days;
    if (typeof raw !== "number") return DEFAULT_EVAL_DAYS;
    return clamp(raw);
  } catch {
    return DEFAULT_EVAL_DAYS;
  }
}

export async function setCoachAiEvalDays(next: number): Promise<number> {
  const value = clamp(next);
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, coach_ai_eval_days: value },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
  return value;
}
