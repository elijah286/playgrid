import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export async function getFeedbackWidgetEnabled(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("feedback_widget_enabled")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return true;
    if (!data) return true;
    return data.feedback_widget_enabled !== false;
  } catch {
    return true;
  }
}

export async function setFeedbackWidgetEnabled(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, feedback_widget_enabled: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
