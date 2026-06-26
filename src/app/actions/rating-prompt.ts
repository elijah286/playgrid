"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getSuggestReviews } from "@/lib/site/review-prompt-config";

export type RatingTrigger =
  | "cal_save"
  | "third_play"
  | "second_share"
  | "first_print";

const ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOLDOWN_DAYS = 365;

/**
 * Record that a rating-prompt trigger has fired for the current user.
 * Each trigger is a one-time milestone (duplicate calls are no-ops). The
 * trigger is persisted even when display gates (account age, cooldown, site
 * setting) are closed, so it can be picked up the next time the nudge checks.
 *
 * Called fire-and-forget from server actions (createPlayAction, invites, Cal
 * play-tools) and from client print components.
 */
export async function recordRatingTrigger(trigger: RatingTrigger): Promise<void> {
  if (!hasSupabaseEnv()) return;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const admin = createServiceRoleClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("rating_triggers_fired")
      .eq("id", user.id)
      .single();
    if (!profile) return;

    const fired = (profile.rating_triggers_fired as string[]) ?? [];
    if (fired.includes(trigger)) return;

    await admin
      .from("profiles")
      .update({ rating_triggers_fired: [...fired, trigger] })
      .eq("id", user.id);
  } catch {
    // best-effort
  }
}

/**
 * Check whether the current user is eligible to see the rating nudge.
 * Called by RatingNudge on every dashboard navigation and on the
 * 'xo:rating-check' custom event.
 *
 * Gates (all must pass):
 *  1. suggest_reviews site setting is not 'off'
 *  2. If setting is 'only_admins', user must be a site admin
 *  3. Account age ≥ 7 days
 *  4. No show in the last 365 days (or never shown)
 *  5. At least one trigger has been recorded
 */
export async function checkRatingEligibility(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  try {
    const setting = await getSuggestReviews();
    if (setting === "off") return false;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const admin = createServiceRoleClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role, created_at, rating_triggers_fired, rating_prompt_shown_at")
      .eq("id", user.id)
      .single();
    if (!profile) return false;

    if (setting === "only_admins" && (profile.role as string) !== "admin") {
      return false;
    }

    const fired = (profile.rating_triggers_fired as string[]) ?? [];
    if (fired.length === 0) return false;

    const ageMs =
      Date.now() - new Date(profile.created_at as string).getTime();
    if (ageMs < ACCOUNT_AGE_MS) return false;

    if (profile.rating_prompt_shown_at) {
      const daysSince =
        (Date.now() -
          new Date(profile.rating_prompt_shown_at as string).getTime()) /
        86400000;
      if (daysSince < COOLDOWN_DAYS) return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Record that the rating nudge was shown. Stamps rating_prompt_shown_at so
 * the 365-day cooldown starts. Called by RatingNudge immediately on render.
 */
export async function recordRatingPromptShown(): Promise<void> {
  if (!hasSupabaseEnv()) return;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const admin = createServiceRoleClient();
    await admin
      .from("profiles")
      .update({ rating_prompt_shown_at: new Date().toISOString() })
      .eq("id", user.id);
  } catch {
    // best-effort
  }
}
