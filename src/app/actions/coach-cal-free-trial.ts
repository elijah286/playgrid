"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { canUseAiFeatures } from "@/lib/billing/features";
import { getCoachCalFreePromptState } from "@/lib/billing/coach-cal-free-prompts";
import { COACH_CAL_FREE_TRIAL_RESET_EMAIL } from "@/lib/billing/coach-cal-test-account";

export type CoachCalFreeTrialStatus = {
  allowance: number;
  used: number;
  remaining: number;
  /** True only for the single test account allowed to self-reset its counter.
   *  Drives a small "(reset)" link in the banner — nobody else sees it. */
  canReset: boolean;
};

/**
 * Free-trial banner data for the CURRENT user, or null when the trial banner
 * shouldn't show:
 *   - unauthenticated
 *   - site admin (unlimited)
 *   - subscription-entitled (Team Coach) — they're metered by the monthly cap,
 *     not the free trial
 *
 * Only genuine free (non-subscribed) users get a non-null result. Read-only;
 * the actual decrement happens server-side in the stream route on success.
 */
export async function getCoachCalFreeTrialStatusAction(): Promise<CoachCalFreeTrialStatus | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "admin") return null;

    const entitlement = await getCurrentEntitlement();
    if (canUseAiFeatures(entitlement)) return null;

    const { allowance, used, remaining } = await getCoachCalFreePromptState(user.id);
    const canReset =
      (user.email ?? "").trim().toLowerCase() === COACH_CAL_FREE_TRIAL_RESET_EMAIL;
    return { allowance, used, remaining, canReset };
  } catch {
    return null;
  }
}
