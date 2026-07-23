"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export async function signOutAction() {
  // The new-UX preview opt-in is persisted on the account
  // (profiles.ux_preview_active), so it deliberately survives sign-out — opting
  // back out is an explicit toggle, not a side effect of logging out.
  if (!hasSupabaseEnv()) redirect("/signed-out");
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Land on a standalone confirmation page rather than "/". Next.js
  // revalidates the form-action's originating route before applying the
  // redirect; if that route requires auth, it throws on the now-cleared
  // session and the user sees error.tsx instead of a clean sign-out.
  redirect("/signed-out");
}
