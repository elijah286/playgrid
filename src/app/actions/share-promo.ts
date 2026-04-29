"use server";

import { getReferralConfig, type ReferralConfig } from "@/lib/site/referral-config";

/** Public-safe view of the referral config so the global share dialog
 *  can decide whether to show the "Get N days free" promo. The config
 *  shape is currently entirely non-sensitive (admin toggle + numbers),
 *  but we route through a thin action so future server-only fields on
 *  the same record don't accidentally leak through if it's expanded. */
export async function getReferralPromoAction(): Promise<ReferralConfig> {
  return getReferralConfig();
}
