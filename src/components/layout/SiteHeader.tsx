import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCachedUserRole } from "@/lib/auth/profile-cache";
import { SiteHeaderShell } from "@/components/layout/SiteHeaderShell";

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
    <SiteHeaderShell
      user={user}
      isAdmin={isAdmin}
      displayName={displayName}
      avatarUrl={avatarUrl}
    />
  );
}
