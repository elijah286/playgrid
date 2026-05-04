"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getCoachAiEvalDays,
  setCoachAiEvalDays,
  COACH_AI_EVAL_DAYS_DEFAULT,
  COACH_AI_EVAL_DAYS_MIN,
  COACH_AI_EVAL_DAYS_MAX,
} from "@/lib/site/coach-ai-eval-config";

export async function getCoachAiEvalDaysAction() {
  if (!hasSupabaseEnv()) {
    return { ok: true as const, value: COACH_AI_EVAL_DAYS_DEFAULT };
  }
  const value = await getCoachAiEvalDays();
  return { ok: true as const, value };
}

export async function setCoachAiEvalDaysAction(value: number) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!Number.isFinite(value)) {
    return { ok: false as const, error: "Enter a whole number." };
  }
  const rounded = Math.floor(value);
  if (rounded < COACH_AI_EVAL_DAYS_MIN || rounded > COACH_AI_EVAL_DAYS_MAX) {
    return {
      ok: false as const,
      error: `Eval window must be between ${COACH_AI_EVAL_DAYS_MIN} and ${COACH_AI_EVAL_DAYS_MAX} days.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden." };
  }

  try {
    const saved = await setCoachAiEvalDays(rounded);
    revalidatePath("/", "layout");
    return { ok: true as const, value: saved };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }
}
