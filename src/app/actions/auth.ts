"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { UX_PREVIEW_COOKIE } from "@/lib/site/ux-preview";

export async function signOutAction() {
  // Clear the per-session new-UX preview opt-in so the next login always
  // starts on the production experience (belt-and-suspenders alongside the
  // session-cookie lifetime).
  try {
    (await cookies()).delete(UX_PREVIEW_COOKIE);
  } catch {
    /* best-effort */
  }
  if (!hasSupabaseEnv()) redirect("/signed-out");
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Land on a standalone confirmation page rather than "/". Next.js
  // revalidates the form-action's originating route before applying the
  // redirect; if that route requires auth, it throws on the now-cleared
  // session and the user sees error.tsx instead of a clean sign-out.
  redirect("/signed-out");
}
