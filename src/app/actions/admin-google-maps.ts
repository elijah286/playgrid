"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getStoredGoogleMapsApiKey,
  previewGoogleMapsKey,
} from "@/lib/site/google-maps-config";

const SITE_ROW_ID = "default";

async function assertAdmin() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden." };
  }
  return { ok: true as const };
}

export async function getGoogleMapsStatusAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("google_maps_api_key, updated_at")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    const preview = previewGoogleMapsKey(data?.google_maps_api_key);
    return {
      ok: true as const,
      configured: preview.configured,
      statusLabel: preview.statusLabel,
      updatedAt: data?.updated_at ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load settings.";
    return { ok: false as const, error: msg };
  }
}

export async function saveGoogleMapsApiKeyAction(rawKey: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const key = rawKey.trim();
  if (!key) {
    return {
      ok: false as const,
      error: "Paste an API key before saving, or use Remove saved key.",
    };
  }

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        google_maps_api_key: key,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed.";
    return { ok: false as const, error: msg };
  }
}

export async function clearGoogleMapsApiKeyAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        google_maps_api_key: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not remove key.";
    return { ok: false as const, error: msg };
  }
}

async function pingGoogleMaps(
  apiKey: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  // Hit Places API (New) autocomplete — the same SKU we use in production —
  // so the test reflects whether the key is actually authorized for our calls.
  const res = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({ input: "Mountain View" }),
      cache: "no-store",
    },
  );
  const body = await res.text();
  if (res.ok) {
    return { ok: true, message: "Connection OK — Places API (New) responded." };
  }
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    return {
      ok: false,
      error:
        j.error?.message ||
        `Places API returned ${res.status}.`,
    };
  } catch {
    return { ok: false, error: `Places API returned ${res.status}.` };
  }
}

export async function testGoogleMapsApiKeyAction(proposedKey?: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const trimmed = (proposedKey ?? "").trim();
  let key: string | null = trimmed.length > 0 ? trimmed : null;
  if (!key) {
    try {
      key = await getStoredGoogleMapsApiKey();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read saved key.";
      return { ok: false as const, error: msg };
    }
  }
  if (!key) {
    return {
      ok: false as const,
      error: "No key to test — paste a key above or save one first.",
    };
  }

  const ping = await pingGoogleMaps(key);
  if (!ping.ok) return { ok: false as const, error: ping.error };
  return { ok: true as const, message: ping.message };
}
