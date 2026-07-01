import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { canUseAiFeatures } from "@/lib/billing/features";
import { hasFreeCalPromptsRemaining } from "@/lib/billing/coach-cal-free-prompts";
import { getCachedUserRole, getCachedCalDebugAccess } from "@/lib/auth/profile-cache";
import { ChatWindow } from "./ChatWindow";

export const metadata = { title: "Coach Cal", robots: { index: false } };

export default async function CoachCalChatPage({
  searchParams,
}: {
  searchParams: Promise<{ playbook?: string }>;
}) {
  if (!hasSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/coach-cal/chat");

  const [entitlement, role] = await Promise.all([
    getCurrentEntitlement(),
    getCachedUserRole(user.id),
  ]);
  const isAdmin = role === "admin";
  // Free users with trial prompts left can open the full chat; only send the
  // truly locked-out (no subscription, no free prompts) to pricing.
  const entitled =
    isAdmin ||
    canUseAiFeatures(entitlement) ||
    (await hasFreeCalPromptsRemaining(user.id));
  if (!entitled) redirect("/pricing");

  // Debug tools (download thread, copy JSON) are a separate grant from
  // entitlement — a flagged account still needs its own Cal access to reach
  // this page at all; this only unlocks the debug affordances once they're here.
  const canDebugCal = isAdmin || (await getCachedCalDebugAccess(user.id));

  const { playbook: playbookId } = await searchParams;

  return (
    <ChatWindow
      playbookId={playbookId ?? null}
      isAdmin={isAdmin}
      canDebugCal={canDebugCal}
    />
  );
}
