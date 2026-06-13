import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type IosInstallCtaConfig = {
  /** Master switch for the iOS App Store install banner. Flipped on by the
   *  Site Admin once the app is live in the App Store. Default false so the
   *  CTA stays dark until then. */
  enabled: boolean;
  /** Numeric App Store (Apple) ID used to build the apps.apple.com link,
   *  e.g. "6471234567". Null until set. The banner needs this — it stays
   *  hidden when null even if `enabled` is true, so flipping the toggle early
   *  can't render a broken link. */
  appStoreId: string | null;
};

export async function getIosInstallCtaConfig(): Promise<IosInstallCtaConfig> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("ios_install_cta_enabled, ios_app_store_id")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error || !data) return { enabled: false, appStoreId: null };
    const id =
      typeof data.ios_app_store_id === "string" &&
      data.ios_app_store_id.trim().length > 0
        ? data.ios_app_store_id.trim()
        : null;
    return { enabled: data.ios_install_cta_enabled === true, appStoreId: id };
  } catch {
    return { enabled: false, appStoreId: null };
  }
}

export async function setIosInstallCtaEnabled(next: boolean): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { id: SITE_ROW_ID, ios_install_cta_enabled: next },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}

export async function setIosAppStoreId(next: string | null): Promise<void> {
  const trimmed = next?.trim() ?? "";
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      {
        id: SITE_ROW_ID,
        ios_app_store_id: trimmed.length > 0 ? trimmed : null,
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(error.message);
}
