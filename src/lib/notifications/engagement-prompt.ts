import type { SupabaseClient } from "@supabase/supabase-js";

// Day-0 guard for the referral launch announcement: don't ask a coach to refer
// friends before they've had a chance to get any value. The account must be at
// least this old before the one-time announcement may show, so it never lands
// in the first-session onboarding rush (terms gate + native welcome).
export const REFERRAL_ANNOUNCEMENT_MIN_ACCOUNT_AGE_DAYS = 1;

/** Pure: is the account old enough to receive the referral launch announcement?
 *  Brand-new — or unknown-age — accounts are held back until a later session. */
export function accountEligibleForReferralAnnouncement(
  createdAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const days = (now - created) / 86400000;
  return days >= REFERRAL_ANNOUNCEMENT_MIN_ACCOUNT_AGE_DAYS;
}

/** Stamp the shared cooldown so other interruptive prompts hold off. Best-effort
 *  — never let a telemetry write break the flow that triggered it. */
export async function stampEngagementPrompt(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    await admin
      .from("profiles")
      .update({ last_engagement_prompt_at: new Date().toISOString() })
      .eq("id", userId);
  } catch {
    /* best-effort */
  }
}

