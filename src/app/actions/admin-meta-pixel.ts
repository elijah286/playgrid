"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  invalidateMetaPixelIdCache,
  previewMetaPixelId,
} from "@/lib/site/meta-pixel-config";

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
  if (profile?.role !== "admin") return { ok: false as const, error: "Forbidden." };
  return { ok: true as const };
}

export type MetaPixelStatus = {
  ok: true;
  configured: boolean;
  statusLabel: string;
};

export async function getMetaPixelStatusAction(): Promise<
  MetaPixelStatus | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("meta_pixel_id")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const { configured, label } = previewMetaPixelId(data?.meta_pixel_id);
    return { ok: true, configured, statusLabel: label };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load settings.";
    return { ok: false, error: msg };
  }
}

export async function saveMetaPixelIdAction(rawId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const id = rawId.trim();
  if (!id) {
    return {
      ok: false as const,
      error: "Paste a pixel ID before saving, or use Remove saved ID.",
    };
  }
  // Meta pixel IDs are 15-16 digit numeric strings. Block obviously bogus
  // values before they ship into the client bundle.
  if (id.length > 64 || !/^[0-9]+$/.test(id)) {
    return {
      ok: false as const,
      error: "That doesn't look like a Meta pixel ID (should be all digits).",
    };
  }
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        meta_pixel_id: id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    invalidateMetaPixelIdCache();
    revalidatePath("/", "layout"); // MetaPixel lives in the root layout
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed.";
    return { ok: false as const, error: msg };
  }
}

export async function clearMetaPixelIdAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        meta_pixel_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    invalidateMetaPixelIdCache();
    revalidatePath("/", "layout");
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not remove ID.";
    return { ok: false as const, error: msg };
  }
}
