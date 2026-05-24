import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type AuthProvidersConfig = {
  apple: boolean;
  google: boolean;
  /** Google OAuth Web Client ID used by the native sign-in plugin to
   *  request an ID token from the system Google SDK. Null on web-only
   *  deploys; setting it from the Site Admin UI is what reveals the
   *  Google button inside the Android/iOS Capacitor wrapper. */
  googleOAuthWebClientId: string | null;
};

export async function getAuthProvidersConfig(): Promise<AuthProvidersConfig> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select(
        "apple_signin_enabled, google_signin_enabled, google_oauth_web_client_id",
      )
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error || !data) {
      return { apple: false, google: false, googleOAuthWebClientId: null };
    }
    const clientId =
      typeof data.google_oauth_web_client_id === "string" &&
      data.google_oauth_web_client_id.trim().length > 0
        ? data.google_oauth_web_client_id.trim()
        : null;
    return {
      apple: data.apple_signin_enabled === true,
      google: data.google_signin_enabled === true,
      googleOAuthWebClientId: clientId,
    };
  } catch {
    return { apple: false, google: false, googleOAuthWebClientId: null };
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

export async function setGoogleOAuthWebClientId(
  next: string | null,
): Promise<void> {
  const trimmed = next?.trim() ?? "";
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      {
        id: SITE_ROW_ID,
        google_oauth_web_client_id: trimmed.length > 0 ? trimmed : null,
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
