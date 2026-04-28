import { unstable_cache, revalidateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

const SITE_ROW_ID = "default";
const CACHE_TAG = "site-seat-defaults";

/** Hardcoded fallbacks if site_settings is unreachable. Keep in sync with
 *  the migration defaults so the user-visible numbers don't shift if the
 *  DB is briefly unreachable. */
export const FALLBACK_DEFAULT_INCLUDED_SEATS = 3;
export const FALLBACK_DEFAULT_COACH_PRO_SEATS = 5;

export type SeatDefaults = {
  /** Default seats included with Team Coach (the `coach` tier). */
  coach: number;
  /** Default seats included with Coach Pro (the `coach_ai` tier). */
  coachPro: number;
};

const fetchSeatDefaults = unstable_cache(
  async (): Promise<SeatDefaults> => {
    try {
      const admin = createServiceRoleClient();
      const { data, error } = await admin
        .from("site_settings")
        .select("default_included_seats, default_coach_pro_seats")
        .eq("id", SITE_ROW_ID)
        .maybeSingle();
      if (error || !data) {
        return {
          coach: FALLBACK_DEFAULT_INCLUDED_SEATS,
          coachPro: FALLBACK_DEFAULT_COACH_PRO_SEATS,
        };
      }
      const coach = sanitize(
        (data as { default_included_seats?: number | null }).default_included_seats,
        FALLBACK_DEFAULT_INCLUDED_SEATS,
      );
      const coachPro = sanitize(
        (data as { default_coach_pro_seats?: number | null }).default_coach_pro_seats,
        FALLBACK_DEFAULT_COACH_PRO_SEATS,
      );
      return { coach, coachPro };
    } catch {
      return {
        coach: FALLBACK_DEFAULT_INCLUDED_SEATS,
        coachPro: FALLBACK_DEFAULT_COACH_PRO_SEATS,
      };
    }
  },
  [CACHE_TAG],
  { tags: [CACHE_TAG], revalidate: 60 },
);

function sanitize(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return fallback;
  return Math.floor(v);
}

export async function getSeatDefaults(): Promise<SeatDefaults> {
  return fetchSeatDefaults();
}

/** Default included seats for a given owner tier. Free owners get 0
 *  (seats only matter for paying owners). */
export async function getDefaultIncludedSeatsForTier(
  tier: SubscriptionTier | null | undefined,
): Promise<number> {
  if (tier !== "coach" && tier !== "coach_ai") return 0;
  const defaults = await getSeatDefaults();
  return tier === "coach_ai" ? defaults.coachPro : defaults.coach;
}

export async function setSeatDefaults(next: Partial<SeatDefaults>): Promise<SeatDefaults> {
  const update: Record<string, number> = {};
  if (next.coach !== undefined) {
    if (!Number.isFinite(next.coach) || next.coach < 0 || next.coach > 1000) {
      throw new Error("Team Coach default seats must be between 0 and 1000.");
    }
    update.default_included_seats = Math.floor(next.coach);
  }
  if (next.coachPro !== undefined) {
    if (!Number.isFinite(next.coachPro) || next.coachPro < 0 || next.coachPro > 1000) {
      throw new Error("Coach Pro default seats must be between 0 and 1000.");
    }
    update.default_coach_pro_seats = Math.floor(next.coachPro);
  }
  if (Object.keys(update).length === 0) return getSeatDefaults();

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert({ id: SITE_ROW_ID, ...update }, { onConflict: "id" });
  if (error) throw new Error(error.message);
  revalidateTag(CACHE_TAG, "max");
  return getSeatDefaults();
}
