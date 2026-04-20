import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCachedUserRole } from "@/lib/auth/profile-cache";
import { UserMenu } from "@/components/layout/UserMenu";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) {
    return <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = await getCachedUserRole(user.id);
  const isAdmin = role === "admin";
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    displayName = (data?.display_name as string | null) ?? null;
    avatarUrl = (data?.avatar_url as string | null) ?? null;
  } catch {
    /* best effort */
  }

  return (
    <div className="flex min-h-full flex-col bg-surface-inset">
      <header className="border-b border-border bg-surface-dark px-6 py-2.5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/home" className="text-sm font-extrabold tracking-tight text-primary">
            PlayGrid
          </Link>
          <UserMenu
            email={user.email ?? ""}
            displayName={displayName}
            isAdmin={isAdmin}
            compact
          />
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 py-5">
        {children}
      </div>
      <FeedbackWidget />
    </div>
  );
}
