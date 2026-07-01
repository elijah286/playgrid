import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";
const DEFAULT_ALLOWANCE = 5;
const MIN_ALLOWANCE = 0;
const MAX_ALLOWANCE = 1000;

export const COACH_CAL_FREE_PROMPT_ALLOWANCE_DEFAULT = DEFAULT_ALLOWANCE;
export const COACH_CAL_FREE_PROMPT_ALLOWANCE_MIN = MIN_ALLOWANCE;
export const COACH_CAL_FREE_PROMPT_ALLOWANCE_MAX = MAX_ALLOWANCE;

function clamp(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_ALLOWANCE;
  return Math.max(MIN_ALLOWANCE, Math.min(MAX_ALLOWANCE, Math.floor(n)));
}

/** How many free Cal prompts a non-subscribed user gets (site-wide, admin
 *  tunable). Falls back to the default on any DB miss so a transient outage
 *  never silently zeroes the allowance. */
export async function getCoachCalFreePromptAllowance(): Promise<number> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("coach_cal_free_prompt_allowance")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error || !data) return DEFAULT_ALLOWANCE;
    const raw = data.coach_cal_free_prompt_allowance;
    if (typeof raw !== "number") return DEFAULT_ALLOWANCE;
    return clamp(raw);
  } catch {
    return DEFAULT_ALLOWANCE;
  }
}

export async function setCoachCalFreePromptAllowance(next: number): Promise<number> {
  const value = clamp(next);
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, coach_cal_free_prompt_allowance: value },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
  return value;
}
