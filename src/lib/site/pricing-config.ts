import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export async function getCoachAiTierEnabled(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("coach_ai_tier_enabled")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return false;
    return data?.coach_ai_tier_enabled === true;
  } catch {
    return false;
  }
}

export async function setCoachAiTierEnabled(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, coach_ai_tier_enabled: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
