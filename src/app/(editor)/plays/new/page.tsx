import { redirect } from "next/navigation";
import { quickCreatePlayAction } from "@/app/actions/plays";
import { hasSupabaseEnv } from "@/lib/supabase/config";

/**
 * Quick-create route: creates a new play in the user's Inbox and bounces to the editor.
 * Used by the first-run flow and the dashboard's "New play" shortcut.
 */
export default async function NewPlayPage() {
  if (!hasSupabaseEnv()) {
    redirect("/login");
  }
  const res = await quickCreatePlayAction();
  if (!res.ok) {
    // Surface the error by sending the user back to the dashboard; a toast there
    // would require client state we don't want to set up for this edge case.
    redirect(`/home?error=${encodeURIComponent(res.error)}`);
  }
  redirect(`/plays/${res.playId}/edit`);
}
