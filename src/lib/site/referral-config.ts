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
  /** Staged-rollout allowlist: emails for whom the program is live even while
   *  `enabled` is false. Used to test the real reward paths before launch. */
  testEmails: string[];
};

const DEFAULTS: ReferralConfig = {
  enabled: false,
  daysPerAward: 30,
  capDays: null,
  recipientTrialDays: 14,
  payerCreditCents: null,
  capAwards: 24,
  testEmails: [],
};

function normalizeEmails(input: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const e = raw.trim().toLowerCase();
    if (!e || !e.includes("@") || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

const fetchReferralConfig = unstable_cache(
  async (): Promise<ReferralConfig> => {
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin
        .from("site_settings")
        .select(
          "referral_enabled, referral_days_per_award, referral_cap_days, referral_recipient_trial_days, referral_payer_credit_cents, referral_cap_awards, referral_test_emails",
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
        referral_test_emails: string[] | null;
      };
      return {
        enabled: row.referral_enabled ?? false,
        daysPerAward: row.referral_days_per_award ?? DEFAULTS.daysPerAward,
        capDays: row.referral_cap_days,
        recipientTrialDays:
          row.referral_recipient_trial_days ?? DEFAULTS.recipientTrialDays,
        payerCreditCents: row.referral_payer_credit_cents,
        capAwards: row.referral_cap_awards,
        testEmails: normalizeEmails(row.referral_test_emails ?? []),
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
  const testEmails = normalizeEmails(next.testEmails);
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
        referral_test_emails: testEmails,
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
  return { ...next, testEmails };
}

/**
 * Resolve the test-cohort emails to auth user ids. Same walk as
 * getAnalyticsExcludedUserIds. Only consulted during the staged-rollout window
 * (global toggle off, test emails present), so the listUsers cost is bounded to
 * low-volume test traffic. Returns an empty set on any error (fail closed).
 */
export async function getReferralTestUserIds(): Promise<Set<string>> {
  const config = await getReferralConfig();
  const wanted = new Set(config.testEmails);
  if (wanted.size === 0) return new Set();
  try {
    const admin = createServiceRoleClient();
    const ids = new Set<string>();
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const users = data?.users ?? [];
      for (const u of users) {
        const e = (u.email ?? "").toLowerCase();
        if (e && wanted.has(e)) ids.add(u.id);
      }
      if (users.length < 1000) break;
    }
    return ids;
  } catch {
    return new Set();
  }
}

/**
 * Is the referral program active for this specific user right now? True when
 * the global program is on, OR the user is in the staged-rollout test cohort.
 * `config` is passed in so hot paths that already loaded it don't re-fetch.
 */
export async function isReferralActiveForUser(
  config: ReferralConfig,
  userId: string | null | undefined,
): Promise<boolean> {
  if (config.enabled) return true;
  if (!userId || config.testEmails.length === 0) return false;
  const testIds = await getReferralTestUserIds();
  return testIds.has(userId);
}
