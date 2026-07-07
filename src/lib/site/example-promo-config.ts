import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type ExamplePromoMode = "off" | "ab" | "everyone";
export type ExamplePromoVariant = "treatment" | "control" | "none";

export type ExamplePromo = {
  /** Whether to show the prominent "Start from an example" CTA. */
  show: boolean;
  /** Which bucket the user is in — recorded on the exposure event so the A/B
   *  lift can be measured (treatment saw the CTA, control saw the subtle link). */
  variant: ExamplePromoVariant;
  /** Echoed so the exposure event can record the mode that produced it. */
  mode: ExamplePromoMode;
};

export async function getExamplePromoMode(): Promise<ExamplePromoMode> {
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("site_settings")
      .select("example_promo_mode")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    const v = (data as { example_promo_mode?: string } | null)?.example_promo_mode;
    return v === "ab" || v === "everyone" ? v : "off";
  } catch {
    return "off";
  }
}

export async function setExamplePromoMode(mode: ExamplePromoMode): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert({ id: SITE_ROW_ID, example_promo_mode: mode }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

/**
 * Deterministic, stable 50/50 A/B bucket from a user id. Pure — same id always
 * yields the same bucket, across renders and sessions, so a user's experience
 * never flickers. FNV-1a low bit gives an even split across UUIDs.
 */
export function abBucket(userId: string): "treatment" | "control" {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h & 1) === 0 ? "treatment" : "control";
}

/** Pure resolver: given the mode + user, decide whether to show the prominent
 *  CTA and record which bucket for analysis. Testable without a DB. */
export function resolveExamplePromo(
  mode: ExamplePromoMode,
  userId: string | null | undefined,
): ExamplePromo {
  if (mode === "off" || !userId) return { show: false, variant: "none", mode };
  if (mode === "everyone") return { show: true, variant: "treatment", mode };
  const bucket = abBucket(userId);
  return { show: bucket === "treatment", variant: bucket, mode };
}
