"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getCoachCalFreePromptAllowance,
  setCoachCalFreePromptAllowance,
  COACH_CAL_FREE_PROMPT_ALLOWANCE_DEFAULT,
  COACH_CAL_FREE_PROMPT_ALLOWANCE_MIN,
  COACH_CAL_FREE_PROMPT_ALLOWANCE_MAX,
} from "@/lib/site/coach-cal-free-prompts-config";

export async function getCoachCalFreePromptAllowanceAction() {
  if (!hasSupabaseEnv()) {
    return { ok: true as const, value: COACH_CAL_FREE_PROMPT_ALLOWANCE_DEFAULT };
  }
  const value = await getCoachCalFreePromptAllowance();
  return { ok: true as const, value };
}

export async function setCoachCalFreePromptAllowanceAction(value: number) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!Number.isFinite(value)) {
    return { ok: false as const, error: "Enter a whole number." };
  }
  const rounded = Math.floor(value);
  if (
    rounded < COACH_CAL_FREE_PROMPT_ALLOWANCE_MIN ||
    rounded > COACH_CAL_FREE_PROMPT_ALLOWANCE_MAX
  ) {
    return {
      ok: false as const,
      error: `Free Cal prompts must be between ${COACH_CAL_FREE_PROMPT_ALLOWANCE_MIN} and ${COACH_CAL_FREE_PROMPT_ALLOWANCE_MAX}.`,
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
    const saved = await setCoachCalFreePromptAllowance(rounded);
    revalidatePath("/", "layout");
    return { ok: true as const, value: saved };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }
}
