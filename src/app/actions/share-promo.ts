"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getReferralPromo, type ReferralPromo } from "@/lib/data/referral-summary";

/** Client-safe, per-user view of the referral promo for the global Share
 *  dialog. Returns only {active, perReferralLabel, recipientTrialDays} — never
 *  the raw ReferralConfig, which carries the staged-rollout test-cohort emails.
 *  `active` respects the test cohort, so testers get accurate copy pre-launch. */
export async function getReferralPromoAction(): Promise<ReferralPromo> {
  const inactive: ReferralPromo = {
    active: false,
    perReferralLabel: "",
    recipientTrialDays: 0,
  };
  if (!hasSupabaseEnv()) return inactive;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return getReferralPromo(user?.id ?? null);
  } catch {
    return inactive;
  }
}
