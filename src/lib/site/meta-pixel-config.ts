import { createServiceRoleClient } from "@/lib/supabase/admin";

// Meta (Facebook) Ads pixel ID. Stored in site_settings so the site admin can
// rotate it without a deploy. Read on every page render via the MetaPixel
// server component; cached in-memory for CACHE_TTL_MS to keep it from hitting
// the DB on every request. Mirrors reddit-pixel-config.ts.

const SITE_ROW_ID = "default";
const CACHE_TTL_MS = 60_000;

let cached: { value: string | null; expiresAt: number } | null = null;

export function previewMetaPixelId(id: string | null | undefined): {
  configured: boolean;
  label: string;
} {
  const t = (id ?? "").trim();
  if (!t) return { configured: false, label: "No pixel ID is saved yet." };
  // Meta pixel IDs are public once the script loads, so surfacing the full
  // value (a 15-16 digit number) is fine.
  return { configured: true, label: `Pixel ID saved: ${t}` };
}

export async function getStoredMetaPixelId(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("meta_pixel_id")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const v = data?.meta_pixel_id;
    const t = typeof v === "string" ? v.trim() : "";
    const value = t.length > 0 ? t : null;
    cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    // Don't hammer DB on failure — cache null for the full TTL.
    cached = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
}

// Called by save / clear admin actions so the next page render sees the new
// value immediately instead of waiting up to CACHE_TTL_MS.
export function invalidateMetaPixelIdCache(): void {
  cached = null;
}
