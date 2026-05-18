"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export async function signOutAction() {
  if (!hasSupabaseEnv()) redirect("/signed-out");
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Land on a standalone confirmation page rather than "/". Next.js
  // revalidates the form-action's originating route before applying the
  // redirect; if that route requires auth, it throws on the now-cleared
  // session and the user sees error.tsx instead of a clean sign-out.
  redirect("/signed-out");
}
