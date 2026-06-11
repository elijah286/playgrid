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
  /** Google OAuth **iOS** Client ID (an iOS-type OAuth client, bound to the
   *  app's bundle ID). Required on top of the web client ID for native
   *  Google sign-in on iOS: the iOS Google SDK initializes with this as its
   *  `clientID` while the web client ID rides along as the server client.
   *  Its reversed form is also baked into the iOS Info.plist URL scheme, so
   *  rotating it needs a new build. Null until the iOS client is created. */
  googleOAuthIosClientId: string | null;
};

export async function getAuthProvidersConfig(): Promise<AuthProvidersConfig> {
  try {
    const admin = createServiceRoleClient();
    // Select the iOS client ID column too, but tolerate its absence: until the
    // google_oauth_ios_client_id migration is applied in prod, that column
    // doesn't exist and the select errors. Rather than let a deploy/migration
    // ordering gap blank out every OAuth button on the live login page, fall
    // back to the always-present columns and treat the iOS ID as unset.
    let { data, error } = await admin
      .from("site_settings")
      .select(
        "apple_signin_enabled, google_signin_enabled, google_oauth_web_client_id, google_oauth_ios_client_id",
      )
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) {
      ({ data, error } = await admin
        .from("site_settings")
        .select(
          "apple_signin_enabled, google_signin_enabled, google_oauth_web_client_id",
        )
        .eq("id", SITE_ROW_ID)
        .maybeSingle());
    }
    if (error || !data) {
      return {
        apple: false,
        google: false,
        googleOAuthWebClientId: null,
        googleOAuthIosClientId: null,
      };
    }
    const clientId =
      typeof data.google_oauth_web_client_id === "string" &&
      data.google_oauth_web_client_id.trim().length > 0
        ? data.google_oauth_web_client_id.trim()
        : null;
    const iosClientId =
      typeof data.google_oauth_ios_client_id === "string" &&
      data.google_oauth_ios_client_id.trim().length > 0
        ? data.google_oauth_ios_client_id.trim()
        : null;
    return {
      apple: data.apple_signin_enabled === true,
      google: data.google_signin_enabled === true,
      googleOAuthWebClientId: clientId,
      googleOAuthIosClientId: iosClientId,
    };
  } catch {
    return {
      apple: false,
      google: false,
      googleOAuthWebClientId: null,
      googleOAuthIosClientId: null,
    };
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

export async function setGoogleOAuthIosClientId(
  next: string | null,
): Promise<void> {
  const trimmed = next?.trim() ?? "";
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      {
        id: SITE_ROW_ID,
        google_oauth_ios_client_id: trimmed.length > 0 ? trimmed : null,
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
