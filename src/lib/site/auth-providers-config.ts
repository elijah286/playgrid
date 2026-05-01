import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type AuthProvidersConfig = {
  apple: boolean;
  google: boolean;
};

export async function getAuthProvidersConfig(): Promise<AuthProvidersConfig> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("apple_signin_enabled, google_signin_enabled")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error || !data) return { apple: false, google: false };
    return {
      apple: data.apple_signin_enabled === true,
      google: data.google_signin_enabled === true,
    };
  } catch {
    return { apple: false, google: false };
  }
}

export async function setAppleSigninEnabled(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, apple_signin_enabled: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}

export async function setGoogleSigninEnabled(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, google_signin_enabled: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
