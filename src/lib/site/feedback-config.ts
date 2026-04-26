import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type FeedbackWidgetSettings = {
  enabled: boolean;
  touchEnabled: boolean;
};

export async function getFeedbackWidgetSettings(): Promise<FeedbackWidgetSettings> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("feedback_widget_enabled, feedback_widget_touch_enabled")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error || !data) return { enabled: true, touchEnabled: false };
    return {
      enabled: data.feedback_widget_enabled !== false,
      touchEnabled: data.feedback_widget_touch_enabled === true,
    };
  } catch {
    return { enabled: true, touchEnabled: false };
  }
}

export async function getFeedbackWidgetEnabled(): Promise<boolean> {
  return (await getFeedbackWidgetSettings()).enabled;
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

export async function setFeedbackWidgetTouchEnabled(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, feedback_widget_touch_enabled: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
