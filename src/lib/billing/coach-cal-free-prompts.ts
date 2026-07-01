import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCoachCalFreePromptAllowance } from "@/lib/site/coach-cal-free-prompts-config";

export type CoachCalFreePromptState = {
  /** Site-wide allowance (admin-configurable). */
  allowance: number;
  /** Lifetime successful free Cal turns this user has spent. */
  used: number;
  /** allowance - used, floored at 0. */
  remaining: number;
  /** True iff this free user may send at least one more free Cal prompt. */
  hasRemaining: boolean;
};

/** Resolve a free (non-subscribed) user's remaining Coach Cal trial prompts.
 *
 *  This is only meaningful for users who aren't otherwise entitled — entitled
 *  (Team Coach) users and admins bypass the allowance entirely and are metered
 *  by the monthly message/cost caps instead. Callers gate on entitlement first,
 *  then consult this only for free users.
 *
 *  Fails open to "no free prompts" (remaining 0) on any error so a DB hiccup
 *  can never accidentally hand out unlimited free Cal. */
export async function getCoachCalFreePromptState(
  userId: string,
): Promise<CoachCalFreePromptState> {
  try {
    const admin = createServiceRoleClient();
    const [allowance, usedRes] = await Promise.all([
      getCoachCalFreePromptAllowance(),
      admin
        .from("profiles")
        .select("coach_cal_free_prompts_used")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    const used = (usedRes.data?.coach_cal_free_prompts_used as number | null) ?? 0;
    const remaining = Math.max(0, allowance - used);
    return { allowance, used, remaining, hasRemaining: remaining > 0 };
  } catch {
    return { allowance: 0, used: 0, remaining: 0, hasRemaining: false };
  }
}

/** Convenience gate for the client-side "does this free user still get the
 *  real Cal launcher (vs the upgrade promo)?" decision, mirrored across the
 *  header, playbook page, play editor, home, and full-screen Cal surfaces.
 *  Fails closed (false) so a DB hiccup can never unlock Cal for free. */
export async function hasFreeCalPromptsRemaining(userId: string): Promise<boolean> {
  return (await getCoachCalFreePromptState(userId)).hasRemaining;
}

/** Atomically record one spent free Cal prompt. Called ONLY from the stream
 *  route's success branch — a failed/errored turn must never decrement a
 *  user's free allowance. Returns the new used-count (best-effort; returns
 *  null on error since this is fire-and-forget like recordUsage). */
export async function recordFreePromptUsed(userId: string): Promise<number | null> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("increment_coach_cal_free_prompts", {
      p_user_id: userId,
    });
    if (error) return null;
    return typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}
