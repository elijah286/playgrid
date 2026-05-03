import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { getCachedUserRole } from "@/lib/auth/profile-cache";
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
  if (!user) redirect("/login?redirect=/coach-cal/chat");

  const [entitlement, role] = await Promise.all([
    getCurrentEntitlement(),
    getCachedUserRole(user.id),
  ]);
  const isAdmin = role === "admin";
  const entitled = isAdmin || (entitlement?.tier ?? "free") === "coach_ai";
  if (!entitled) redirect("/pricing");

  const { playbook: playbookId } = await searchParams;

  return <ChatWindow playbookId={playbookId ?? null} isAdmin={isAdmin} />;
}
