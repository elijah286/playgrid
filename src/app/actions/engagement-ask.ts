"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getSuggestReviews } from "@/lib/site/review-prompt-config";
import { getReferralPromo } from "@/lib/data/referral-summary";
import {
  selectEngagementAsk,
  type EngagementAskKind,
} from "@/lib/engagement/asks";
import {
  claimEngagementSlot,
  isWithinEngagementCooldown,
} from "@/lib/engagement/claim";
import { accountEligibleForReferralAnnouncement } from "@/lib/notifications/engagement-prompt";
import { isNativeAppRequest } from "@/lib/native/nativeRequest";

const RATING_MIN_ACCOUNT_AGE_MS = 7 * 86400000;
const RATING_COOLDOWN_DAYS = 365;

export type EngagementAsk =
  | { kind: "rating" }
  | {
      kind: "referral_announcement";
      perReferralLabel: string;
      recipientTrialDays: number;
    };

type ProfileRow = {
  role: string | null;
  created_at: string | null;
  rating_triggers_fired: string[] | null;
  rating_prompt_shown_at: string | null;
  last_engagement_prompt_at: string | null;
  referral_announcement_seen_at: string | null;
};

/** Rating gates that don't need a network call beyond the profile row.
 *  `native` is required: the ask deep-links into the App/Play Store rating
 *  sheet, which is meaningless in a web browser. The old nudge enforced this
 *  client-side (isNativeApp) — here it must be server-side, because a web-only
 *  coach must never even be *selected*, or they'd win the slot and then render
 *  nothing. */
function ratingEligible(
  profile: ProfileRow,
  setting: Awaited<ReturnType<typeof getSuggestReviews>>,
  native: boolean,
): boolean {
  if (!native) return false;
  if (setting === "off") return false;
  if (setting === "only_admins" && profile.role !== "admin") return false;
  if ((profile.rating_triggers_fired ?? []).length === 0) return false;
  if (!profile.created_at) return false;
  if (Date.now() - new Date(profile.created_at).getTime() < RATING_MIN_ACCOUNT_AGE_MS) {
    return false;
  }
  if (profile.rating_prompt_shown_at) {
    const days =
      (Date.now() - new Date(profile.rating_prompt_shown_at).getTime()) / 86400000;
    if (days < RATING_COOLDOWN_DAYS) return false;
  }
  return true;
}

/**
 * Which ask (if any) this coach is eligible for right now. READ-ONLY — it
 * stamps nothing, so a coach whose ask never reaches the screen (deferred
 * behind the native welcome, or the tab closed first) doesn't burn their
 * cooldown or their one-shot announcement. The reservation happens later, in
 * claimEngagementAsk, at the moment of display.
 *
 * Both candidates are evaluated together and the highest-priority ELIGIBLE one
 * wins. This is deliberately not a chain of "ask A defers to ask B" gates: that
 * shape deadlocked — the rating nudge blocked on an unseen referral
 * announcement that, for a coach the announcement never applied to, would never
 * become seen, so the rating nudge could never fire. Selection over a filtered
 * candidate list cannot deadlock, because an ineligible candidate simply isn't
 * in the list.
 */
export async function checkEngagementAsk(): Promise<EngagementAsk | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("profiles")
      .select(
        "role, created_at, rating_triggers_fired, rating_prompt_shown_at, last_engagement_prompt_at, referral_announcement_seen_at",
      )
      .eq("id", user.id)
      .single();
    if (!data) return null;
    const profile = data as ProfileRow;

    // One ask per cooldown window, whichever it is. Checked here to avoid the
    // downstream work; the claim re-checks it atomically and is the authority.
    if (isWithinEngagementCooldown(profile.last_engagement_prompt_at)) return null;

    const eligible: EngagementAskKind[] = [];

    const [setting, promo, native] = await Promise.all([
      getSuggestReviews(),
      profile.referral_announcement_seen_at
        ? Promise.resolve(null)
        : getReferralPromo(user.id),
      isNativeAppRequest(),
    ]);

    if (ratingEligible(profile, setting, native)) eligible.push("rating");

    const referralOk =
      !profile.referral_announcement_seen_at &&
      accountEligibleForReferralAnnouncement(user.created_at) &&
      !!promo?.active;
    if (referralOk) eligible.push("referral_announcement");

    const winner = selectEngagementAsk(eligible);
    if (winner === "rating") return { kind: "rating" };
    if (winner === "referral_announcement" && promo) {
      return {
        kind: "referral_announcement",
        perReferralLabel: promo.perReferralLabel,
        recipientTrialDays: promo.recipientTrialDays,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reserve the engagement window at the moment of display. Returns false when
 * another ask already took it — the caller must then render nothing.
 *
 * Deliberately does no per-ask bookkeeping: each ask already records itself on
 * display (recordRatingPromptShown, markReferralAnnouncementSeenAction), and
 * those recorders are what set the per-ask cooldowns. This action's only job is
 * the one thing neither ask can do for itself — decide, atomically, which of
 * them is allowed to speak.
 */
export async function claimEngagementAsk(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    return await claimEngagementSlot(createServiceRoleClient(), user.id);
  } catch {
    return false;
  }
}
