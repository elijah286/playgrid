import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";
const CACHE_TAG = "site-referral-config";

export type ReferralConfig = {
  /** When false, no referral credits are awarded — admin off-switch. */
  enabled: boolean;
  /** Days of Team Coach added to the sender for each qualifying claim. */
  daysPerAward: number;
  /** Lifetime cap on cumulative days a single sender can earn. Null = no cap. */
  capDays: number | null;
};

const DEFAULTS: ReferralConfig = {
  enabled: false,
  daysPerAward: 30,
  capDays: null,
};

const fetchReferralConfig = unstable_cache(
  async (): Promise<ReferralConfig> => {
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin
        .from("site_settings")
        .select("referral_enabled, referral_days_per_award, referral_cap_days")
        .eq("id", SITE_ROW_ID)
        .maybeSingle();
      if (error || !data) return { ...DEFAULTS };
      const row = data as {
        referral_enabled: boolean | null;
        referral_days_per_award: number | null;
        referral_cap_days: number | null;
      };
      return {
        enabled: row.referral_enabled ?? false,
        daysPerAward: row.referral_days_per_award ?? DEFAULTS.daysPerAward,
        capDays: row.referral_cap_days,
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
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      {
        id: SITE_ROW_ID,
        referral_enabled: next.enabled,
        referral_days_per_award: next.daysPerAward,
        referral_cap_days: next.capDays,
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
  return next;
}
