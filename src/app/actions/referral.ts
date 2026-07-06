"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getReferralPromo } from "@/lib/data/referral-summary";
import {
  isWithinEngagementCooldown,
  accountEligibleForReferralAnnouncement,
} from "@/lib/notifications/engagement-prompt";

export type ReferralAnnouncement = {
  perReferralLabel: string;
  recipientTrialDays: number;
};

/**
 * The one-time referral launch announcement for the current user, or null when
 * it shouldn't show: account is brand new (day-0 guard), program not live for
 * them, already seen, or another engagement prompt fired in the last 14 days
 * (shared cooldown). Called by the announcement nudge on mount.
 */
export async function getReferralAnnouncementAction(): Promise<ReferralAnnouncement | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    // Day-0 guard: never ask a brand-new coach to refer on their first session.
    if (!accountEligibleForReferralAnnouncement(user.created_at)) return null;

    const admin = createServiceRoleClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("referral_announcement_seen_at, last_engagement_prompt_at")
      .eq("id", user.id)
      .single();
    if (!profile) return null;
    if (profile.referral_announcement_seen_at) return null;
    if (isWithinEngagementCooldown(profile.last_engagement_prompt_at as string | null)) {
      return null;
    }

    const promo = await getReferralPromo(user.id);
    if (!promo.active) return null;
    return {
      perReferralLabel: promo.perReferralLabel,
      recipientTrialDays: promo.recipientTrialDays,
    };
  } catch {
    return null;
  }
}

/**
 * Mark the referral announcement seen (fires once) and stamp the shared
 * engagement cooldown so a review nudge won't immediately follow. Called by the
 * announcement nudge the moment it renders.
 */
export async function markReferralAnnouncementSeenAction(): Promise<void> {
  if (!hasSupabaseEnv()) return;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const admin = createServiceRoleClient();
    const nowIso = new Date().toISOString();
    await admin
      .from("profiles")
      .update({
        referral_announcement_seen_at: nowIso,
        last_engagement_prompt_at: nowIso,
      })
      .eq("id", user.id);
  } catch {
    /* best-effort */
  }
}
