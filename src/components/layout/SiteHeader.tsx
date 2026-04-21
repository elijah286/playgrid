import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCachedUserRole } from "@/lib/auth/profile-cache";
import { UserMenu } from "@/components/layout/UserMenu";

export async function SiteHeader() {
  let user: { id: string; email: string | null } | null = null;
  let isAdmin = false;
  let displayName: string | null = null;
  let avatarUrl: string | null = null;

  if (hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        user = { id: authUser.id, email: authUser.email ?? null };
        const role = await getCachedUserRole(authUser.id);
        isAdmin = role === "admin";
        try {
          const admin = createServiceRoleClient();
          const { data } = await admin
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", authUser.id)
            .maybeSingle();
          displayName = (data?.display_name as string | null) ?? null;
          avatarUrl = (data?.avatar_url as string | null) ?? null;
        } catch {
          /* best effort */
        }
      }
    } catch {
      /* unauthenticated — render anonymous header */
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-raised/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href={user ? "/home" : "/"}
          className="text-lg font-extrabold tracking-tight text-primary"
        >
          PlayGrid
        </Link>
        {user ? (
          <UserMenu
            email={user.email ?? ""}
            displayName={displayName}
            avatarUrl={avatarUrl}
            isAdmin={isAdmin}
          />
        ) : (
          <Link
            href="/login"
            className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
