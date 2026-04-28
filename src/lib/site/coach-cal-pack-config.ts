import { unstable_cache, revalidateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";
const CACHE_TAG = "site-coach-cal-pack";

/** Fallbacks if site_settings is unreachable. Keep aligned with the
 *  migration defaults so the user-visible pack number stays stable
 *  during a brief DB blip. */
export const FALLBACK_PACK_MESSAGE_COUNT = 100;
export const FALLBACK_PACK_PRICE_USD_CENTS = 500;

export type CoachCalPackConfig = {
  /** How many extra Coach Cal messages the pack adds. */
  messageCount: number;
  /** Display price in USD cents. Stripe is the actual source of truth
   *  for the charge — this is just for UI copy. Admin keeps them in
   *  sync. */
  priceUsdCents: number;
};

const fetchPackConfig = unstable_cache(
  async (): Promise<CoachCalPackConfig> => {
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin
        .from("site_settings")
        .select("coach_cal_pack_message_count, coach_cal_pack_price_usd_cents")
        .eq("id", SITE_ROW_ID)
        .maybeSingle();
      if (error || !data) {
        return {
          messageCount: FALLBACK_PACK_MESSAGE_COUNT,
          priceUsdCents: FALLBACK_PACK_PRICE_USD_CENTS,
        };
      }
      return {
        messageCount: sanitize(
          (data as { coach_cal_pack_message_count?: number | null }).coach_cal_pack_message_count,
          FALLBACK_PACK_MESSAGE_COUNT,
          1,
        ),
        priceUsdCents: sanitize(
          (data as { coach_cal_pack_price_usd_cents?: number | null }).coach_cal_pack_price_usd_cents,
          FALLBACK_PACK_PRICE_USD_CENTS,
          1,
        ),
      };
    } catch {
      return {
        messageCount: FALLBACK_PACK_MESSAGE_COUNT,
        priceUsdCents: FALLBACK_PACK_PRICE_USD_CENTS,
      };
    }
  },
  [CACHE_TAG],
  { tags: [CACHE_TAG], revalidate: 60 },
);

function sanitize(v: unknown, fallback: number, min: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min) return fallback;
  return Math.floor(v);
}

export async function getCoachCalPackConfig(): Promise<CoachCalPackConfig> {
  return fetchPackConfig();
}

export async function setCoachCalPackConfig(
  next: Partial<CoachCalPackConfig>,
): Promise<CoachCalPackConfig> {
  const update: Record<string, number> = {};
  if (next.messageCount !== undefined) {
    if (!Number.isFinite(next.messageCount) || next.messageCount < 1 || next.messageCount > 100000) {
      throw new Error("Pack message count must be between 1 and 100000.");
    }
    update.coach_cal_pack_message_count = Math.floor(next.messageCount);
  }
  if (next.priceUsdCents !== undefined) {
    if (!Number.isFinite(next.priceUsdCents) || next.priceUsdCents < 1 || next.priceUsdCents > 1_000_000) {
      throw new Error("Pack price must be between $0.01 and $10000.");
    }
    update.coach_cal_pack_price_usd_cents = Math.floor(next.priceUsdCents);
  }
  if (Object.keys(update).length === 0) return getCoachCalPackConfig();

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert({ id: SITE_ROW_ID, ...update }, { onConflict: "id" });
  if (error) throw new Error(error.message);
  revalidateTag(CACHE_TAG, "max");
  return getCoachCalPackConfig();
}

export function formatPackPrice(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}
