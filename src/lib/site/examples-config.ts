import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export async function getExamplesPageEnabled(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("examples_page_enabled")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return false;
    return data?.examples_page_enabled === true;
  } catch {
    return false;
  }
}

export async function setExamplesPageEnabled(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, examples_page_enabled: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
