import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getReferralConfig } from "@/lib/site/referral-config";
import { tagShareUrl } from "@/lib/share/tag-url";

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
  if (!config.enabled) return null;

  const admin = createServiceRoleClient();

  // Which reward branch this user falls into (paying → Stripe credit).
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"])
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();
  const isPayer = Boolean(sub?.stripe_customer_id);

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

  const perReferralLabel = isPayer
    ? config.payerCreditCents !== null
      ? `$${(config.payerCreditCents / 100).toFixed(0)} account credit`
      : "a one-month account credit"
    : `${config.daysPerAward} days of Team Coach`;

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
