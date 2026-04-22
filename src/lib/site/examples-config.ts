import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export async function getExamplesUserId(): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("examples_user_id")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return null;
    return (data?.examples_user_id as string | null) ?? null;
  } catch {
    return null;
  }
}

export async function setExamplesUserId(userId: string | null): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, examples_user_id: userId },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
