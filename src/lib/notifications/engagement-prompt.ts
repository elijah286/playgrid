import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getReferralConfig,
  isReferralActiveForUser,
} from "@/lib/site/referral-config";

// Shared cooldown between ANY two interruptive engagement "asks" — the App
// Store review nudge, the one-time referral launch announcement, and the
// referral-reward push. Each stamps profiles.last_engagement_prompt_at on show;
// all of them check it first, so a coach never gets two stacked in one window.
export const ENGAGEMENT_PROMPT_COOLDOWN_DAYS = 14;

export function isWithinEngagementCooldown(
  lastAt: string | null | undefined,
): boolean {
  if (!lastAt) return false;
  const days = (Date.now() - new Date(lastAt).getTime()) / 86400000;
  return days < ENGAGEMENT_PROMPT_COOLDOWN_DAYS;
}

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

/**
 * Is the one-time referral launch announcement still owed to this user — i.e.
 * the program is live for them and they've never seen it? Used as a priority
 * gate: while the announcement is owed, the review nudge holds so the coach
 * sees the (one-time) announcement first. `seenAt` is passed in so callers that
 * already loaded the profile don't re-read it.
 */
export async function isReferralAnnouncementOwed(
  userId: string,
  seenAt: string | null | undefined,
): Promise<boolean> {
  if (seenAt) return false;
  const config = await getReferralConfig();
  return isReferralActiveForUser(config, userId);
}
