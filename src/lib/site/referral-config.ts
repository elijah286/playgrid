import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";
const CACHE_TAG = "site-referral-config";

export type ReferralConfig = {
  /** When false, no referral credits are awarded — admin off-switch. */
  enabled: boolean;
  /** Days of Team Coach added to a FREE sender for each qualifying claim.
   *  (Paying senders get a Stripe credit instead — see payerCreditCents.) */
  daysPerAward: number;
  /** Legacy lifetime cap on cumulative comp DAYS a single sender can earn.
   *  Null = no day cap. Still honored for the comp-days branch; the primary
   *  guard is now capAwards (which also bounds Stripe-credit awards). */
  capDays: number | null;
  /** Team Coach trial days minted to the NEW coach (recipient) on a qualifying
   *  referral. 0 = recipient side disabled (one-sided program). */
  recipientTrialDays: number;
  /** Fixed Stripe credit (cents) for a PAYING sender. Null = auto: one month of
   *  the coach monthly price, fetched from Stripe at award time. */
  payerCreditCents: number | null;
  /** Lifetime cap on the NUMBER of qualifying referrals a single sender can be
   *  rewarded for. Null = uncapped. Applies to both reward kinds. */
  capAwards: number | null;
};

const DEFAULTS: ReferralConfig = {
  enabled: false,
  daysPerAward: 30,
  capDays: null,
  recipientTrialDays: 14,
  payerCreditCents: null,
  capAwards: 24,
};

const fetchReferralConfig = unstable_cache(
  async (): Promise<ReferralConfig> => {
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin
        .from("site_settings")
        .select(
          "referral_enabled, referral_days_per_award, referral_cap_days, referral_recipient_trial_days, referral_payer_credit_cents, referral_cap_awards",
        )
        .eq("id", SITE_ROW_ID)
        .maybeSingle();
      if (error || !data) return { ...DEFAULTS };
      const row = data as {
        referral_enabled: boolean | null;
        referral_days_per_award: number | null;
        referral_cap_days: number | null;
        referral_recipient_trial_days: number | null;
        referral_payer_credit_cents: number | null;
        referral_cap_awards: number | null;
      };
      return {
        enabled: row.referral_enabled ?? false,
        daysPerAward: row.referral_days_per_award ?? DEFAULTS.daysPerAward,
        capDays: row.referral_cap_days,
        recipientTrialDays:
          row.referral_recipient_trial_days ?? DEFAULTS.recipientTrialDays,
        payerCreditCents: row.referral_payer_credit_cents,
        capAwards: row.referral_cap_awards,
      };
    } catch {
      return { ...DEFAULTS };
    }
  },
  [CACHE_TAG],
  { tags: [CACHE_TAG], revalidate: 60 },
);

export async function getReferralConfig(): Promise<ReferralConfig> {
  return fetchReferralConfig();
}

export async function setReferralConfig(
  next: ReferralConfig,
): Promise<ReferralConfig> {
  if (next.daysPerAward < 1 || next.daysPerAward > 3650) {
    throw new Error("daysPerAward must be between 1 and 3650.");
  }
  if (next.capDays !== null && (next.capDays < 1 || next.capDays > 3650)) {
    throw new Error("capDays must be between 1 and 3650, or null for no cap.");
  }
  if (next.recipientTrialDays < 0 || next.recipientTrialDays > 3650) {
    throw new Error("recipientTrialDays must be between 0 and 3650.");
  }
  if (
    next.payerCreditCents !== null &&
    (next.payerCreditCents < 0 || next.payerCreditCents > 100000)
  ) {
    throw new Error(
      "payerCreditCents must be between 0 and 100000, or null for auto.",
    );
  }
  if (
    next.capAwards !== null &&
    (next.capAwards < 1 || next.capAwards > 100000)
  ) {
    throw new Error("capAwards must be between 1 and 100000, or null for no cap.");
  }
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      {
        id: SITE_ROW_ID,
        referral_enabled: next.enabled,
        referral_days_per_award: next.daysPerAward,
        referral_cap_days: next.capDays,
        referral_recipient_trial_days: next.recipientTrialDays,
        referral_payer_credit_cents: next.payerCreditCents,
        referral_cap_awards: next.capAwards,
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
  return next;
}
