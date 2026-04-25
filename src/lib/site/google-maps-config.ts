import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type GoogleMapsPreview = {
  configured: boolean;
  statusLabel: string;
};

export function previewGoogleMapsKey(
  key: string | null | undefined,
): GoogleMapsPreview {
  const k = (key ?? "").trim();
  if (!k) {
    return {
      configured: false,
      statusLabel: "No Google Maps API key is saved yet.",
    };
  }
  const tail = k.length >= 4 ? k.slice(-4) : "••••";
  return {
    configured: true,
    statusLabel: `A Google Maps key is saved (ends with …${tail}).`,
  };
}

export async function getStoredGoogleMapsApiKey(): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("site_settings")
    .select("google_maps_api_key")
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const key =
    typeof data?.google_maps_api_key === "string"
      ? data.google_maps_api_key.trim()
      : "";
  return key.length > 0 ? key : null;
}
