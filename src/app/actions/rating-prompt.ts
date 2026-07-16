"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  buildRatingPromptNotice,
  buildRatingShownNotice,
  type RatingOutcome,
  type RatingSentiment,
} from "@/lib/notifications/rating-prompt-notice";

export type RatingTrigger =
  | "cal_save"
  | "third_play"
  | "second_share"
  | "first_print";

const ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOLDOWN_DAYS = 365;
// Fallback engagement signal when no explicit rating trigger has fired: a coach
// who has created this many plays is engaged enough to ask for a review.
const RATING_MIN_PLAYS = 3;

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
 * Record what the coach did on the rating nudge as a site-admin notice.
 *
 * Fired for the two terminal outcomes that don't already emit a notice:
 *  - "rated"     — happy coach was sent to the App Store to review.
 *  - "dismissed" — coach closed the prompt without reviewing.
 * The unhappy → private-feedback path goes through submitFeedbackAction, which
 * emits its own 'feedback_received' notice, so it isn't handled here.
 *
 * Writes a review_prompt row to system_notices via the service-role client
 * (system_notices has no INSERT RLS policy). Best-effort — a failure to log the
 * outcome must never break the coach's flow (they've already tapped through).
 */
export async function recordRatingOutcome(
  outcome: RatingOutcome,
  platform: "ios" | "android",
  sentiment: RatingSentiment = "unknown",
): Promise<void> {
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
      .select("display_name")
      .eq("id", user.id)
      .single();

    const displayName = (profile?.display_name as string | null)?.trim() || null;
    const who = displayName || user.email || "Someone";

    const notice = buildRatingPromptNotice({ who, outcome, platform, sentiment });
    await admin.from("system_notices").insert({
      kind: notice.kind,
      severity: notice.severity,
      user_id: user.id,
      user_display_name: displayName,
      user_email: user.email ?? null,
      body: notice.body,
      href: notice.href,
      detail: notice.detail,
    });
  } catch {
    // best-effort — telemetry only
  }
}

/**
 * Record that the rating nudge was shown. Does two things:
 *  1. Stamps profiles.rating_prompt_shown_at so the 365-day cooldown starts.
 *  2. Writes a 'review_prompt' notice (detail.outcome = 'shown') so the site
 *     admin inbox shows who was shown the nudge and when — the top of the
 *     funnel, recorded independently of whether the coach ever acts. Without
 *     this, a nudge that's shown then ignored is invisible to admins (the
 *     outcome notices only fire on a tap-through).
 *
 * Called by RatingAsk immediately on render. The cooldown stamp happens
 * first and the notice insert is a best-effort add-on, so a failure to log the
 * send (e.g. before the review_prompt migration lands) can never break the
 * cooldown or the coach's flow.
 */
export async function recordRatingPromptShown(
  platform: "ios" | "android" = "ios",
): Promise<void> {
  if (!hasSupabaseEnv()) return;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const admin = createServiceRoleClient();

    // Cooldown stamp first — this is the load-bearing part and must not be
    // gated on the notice insert succeeding. Stamp BOTH the review-specific
    // 365-day cooldown and the shared 14-day engagement cooldown so a referral
    // ask won't stack on top of this nudge.
    const nowIso = new Date().toISOString();
    await admin
      .from("profiles")
      .update({
        rating_prompt_shown_at: nowIso,
        last_engagement_prompt_at: nowIso,
      })
      .eq("id", user.id);

    // Then record the send as an admin-inbox event (best-effort telemetry).
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    const displayName = (profile?.display_name as string | null)?.trim() || null;
    const who = displayName || user.email || "Someone";

    const notice = buildRatingShownNotice({ who, platform });
    await admin.from("system_notices").insert({
      kind: notice.kind,
      severity: notice.severity,
      user_id: user.id,
      user_display_name: displayName,
      user_email: user.email ?? null,
      body: notice.body,
      href: notice.href,
      detail: notice.detail,
    });
  } catch {
    // best-effort
  }
}
