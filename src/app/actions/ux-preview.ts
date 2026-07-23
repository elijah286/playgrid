"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-account opt-in toggle for the new-UX preview shell.
 *
 * The choice is persisted on `profiles.ux_preview_active` (not a per-browser
 * cookie) so it follows the account across every device and survives browser
 * restarts, until the user explicitly switches back to Production.
 *
 * This ONLY flips the preference. It does NOT grant access — availability is
 * enforced separately at render time (see `resolveUxPreview` / the `new_shell`
 * beta flag + allowlist). A user who isn't allowed can set this true and still
 * see production, because the layout gate checks allowlist/admin regardless.
 */
export async function setUxPreviewActiveAction(on: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ ux_preview_active: on })
    .eq("id", user.id);
  if (error) return { ok: false as const, error: error.message };

  // Re-render the shell so the ribbon + new chrome reflect the change.
  revalidatePath("/", "layout");
  return { ok: true as const, active: on };
}

/** Read the current per-account toggle state (for the admin banner's initial UI). */
export async function getUxPreviewActiveAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true as const, active: false };

  const { data } = await supabase
    .from("profiles")
    .select("ux_preview_active")
    .eq("id", user.id)
    .maybeSingle();
  return {
    ok: true as const,
    active: (data?.ux_preview_active as boolean | null) ?? false,
  };
}
