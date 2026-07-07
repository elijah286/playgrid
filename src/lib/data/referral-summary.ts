import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getReferralConfig,
  isReferralActiveForUser,
  type ReferralConfig,
} from "@/lib/site/referral-config";
import { tagShareUrl } from "@/lib/share/tag-url";

/** Does this user hold an active PAYING subscription (→ Stripe-credit reward)? */
async function isPayingUser(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"])
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.stripe_customer_id);
}

/** Human label for the per-referral reward THIS user earns. */
function promoLabel(config: ReferralConfig, isPayer: boolean): string {
  if (isPayer) {
    return config.payerCreditCents !== null
      ? `$${(config.payerCreditCents / 100).toFixed(0)} account credit`
      : "a one-month account credit";
  }
  return `${config.daysPerAward} days of Team Coach`;
}

/**
 * Per-user, client-SAFE view of the referral program for promo surfaces (share
 * dialog, send-a-copy card). Deliberately narrow — never returns the raw config
 * (which carries the test-cohort emails). `active` respects the staged-rollout
 * cohort so testers see accurate copy before the global launch.
 */
export type ReferralPromo = {
  active: boolean;
  /** e.g. "$9 account credit" or "30 days of Team Coach". Empty when inactive. */
  perReferralLabel: string;
  /** Trial days the referred coach receives. */
  recipientTrialDays: number;
  /** Lifetime cap on rewarded referrals, or null for uncapped. Drives the
   *  terms disclosure so promo surfaces state the same cap the awarder enforces. */
  capAwards: number | null;
};

export async function getReferralPromo(
  userId: string | null,
): Promise<ReferralPromo> {
  const config = await getReferralConfig();
  const active = await isReferralActiveForUser(config, userId);
  if (!active || !userId) {
    return { active: false, perReferralLabel: "", recipientTrialDays: 0, capAwards: null };
  }
  const admin = createServiceRoleClient();
  const isPayer = await isPayingUser(admin, userId);
  return {
    active: true,
    perReferralLabel: promoLabel(config, isPayer),
    recipientTrialDays: config.recipientTrialDays,
    capAwards: config.capAwards,
  };
}

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export type ReferralSummary = {
  /** The share link with ?ref= baked in — hand this out to earn rewards. */
  shareUrl: string;
  /** What THIS user earns per qualifying referral (their own reward branch). */
  rewardKind: "stripe_credit" | "comp_days";
  /** Human label for the per-referral reward, e.g. "$9 account credit" or
   *  "30 days of Team Coach". */
  perReferralLabel: string;
  /** Trial days the coaches they refer receive (the double-sided incentive). */
  recipientTrialDays: number;
  /** Coaches attributed to this user (profiles.referred_by), rewarded or not. */
  referredCount: number;
  /** Referrals that have paid out. */
  rewardedCount: number;
  totalDaysEarned: number;
  totalCreditCents: number;
  /** Lifetime cap on rewarded referrals, or null for uncapped. */
  capAwards: number | null;
};

/**
 * A user's own referral standing for the Account "Refer coaches" card. Returns
 * null when the program is disabled (the card is hidden — we never promise a
 * reward the program won't pay). Service-role because it counts across other
 * users' profiles and reads the awards ledger.
 */
export async function getReferralSummaryForUser(
  userId: string,
): Promise<ReferralSummary | null> {
  const config = await getReferralConfig();
  // Show the card when the program is live for this user — globally, or because
  // they're in the staged-rollout test cohort.
  if (!(await isReferralActiveForUser(config, userId))) return null;

  const admin = createServiceRoleClient();

  // Which reward branch this user falls into (paying → Stripe credit).
  const isPayer = await isPayingUser(admin, userId);

  const [{ count: referredCount }, { data: awards }] = await Promise.all([
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", userId),
    admin
      .from("referral_awards")
      .select("days_awarded, credit_cents")
      .eq("sender_id", userId),
  ]);

  const rewardedCount = awards?.length ?? 0;
  const totalDaysEarned = (awards ?? []).reduce(
    (acc, r: { days_awarded: number | null }) => acc + (r.days_awarded ?? 0),
    0,
  );
  const totalCreditCents = (awards ?? []).reduce(
    (acc, r: { credit_cents: number | null }) => acc + (r.credit_cents ?? 0),
    0,
  );

  const perReferralLabel = promoLabel(config, isPayer);

  return {
    shareUrl: tagShareUrl(SITE_URL, {
      kind: "site_share",
      channel: "copy_link",
      senderId: userId,
    }),
    rewardKind: isPayer ? "stripe_credit" : "comp_days",
    perReferralLabel,
    recipientTrialDays: config.recipientTrialDays,
    referredCount: referredCount ?? 0,
    rewardedCount,
    totalDaysEarned,
    totalCreditCents,
    capAwards: config.capAwards,
  };
}
