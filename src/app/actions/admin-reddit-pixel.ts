"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  invalidateRedditPixelIdCache,
  previewRedditPixelId,
} from "@/lib/site/reddit-pixel-config";

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

export type RedditPixelStatus = {
  ok: true;
  configured: boolean;
  statusLabel: string;
};

export async function getRedditPixelStatusAction(): Promise<
  RedditPixelStatus | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("reddit_pixel_id")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const { configured, label } = previewRedditPixelId(data?.reddit_pixel_id);
    return { ok: true, configured, statusLabel: label };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load settings.";
    return { ok: false, error: msg };
  }
}

export async function saveRedditPixelIdAction(rawId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const id = rawId.trim();
  if (!id) {
    return {
      ok: false as const,
      error: "Paste a pixel ID before saving, or use Remove saved ID.",
    };
  }
  // Reddit's pixel IDs are short identifiers — block obviously bogus values
  // before they ship into the client bundle and 404 the pixel.js call.
  if (id.length > 128 || /[<>"'`\s]/.test(id)) {
    return { ok: false as const, error: "That doesn't look like a Reddit pixel ID." };
  }
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        reddit_pixel_id: id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    invalidateRedditPixelIdCache();
    revalidatePath("/", "layout"); // RedditPixel lives in the root layout
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed.";
    return { ok: false as const, error: msg };
  }
}

export async function clearRedditPixelIdAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .update({
        reddit_pixel_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", SITE_ROW_ID);
    if (error) return { ok: false as const, error: error.message };
    invalidateRedditPixelIdCache();
    revalidatePath("/", "layout");
    revalidatePath("/settings");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not remove ID.";
    return { ok: false as const, error: msg };
  }
}
