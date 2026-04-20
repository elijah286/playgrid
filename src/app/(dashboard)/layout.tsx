import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCachedUserRole } from "@/lib/auth/profile-cache";
import { UserMenu } from "@/components/layout/UserMenu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabaseEnv()) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-muted">
          Add Supabase environment variables to use authenticated playbooks.
        </p>
        <div className="mt-6">{children}</div>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
    /* profile lookup is best-effort for the avatar */
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-raised/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/home" className="text-lg font-extrabold tracking-tight text-primary">
            PlayGrid
          </Link>
          <UserMenu
            email={user.email ?? ""}
            displayName={displayName}
            avatarUrl={avatarUrl}
            isAdmin={isAdmin}
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {children}
      </main>
    </div>
  );
}
