import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const getCachedUserRole = (userId: string) =>
  unstable_cache(
    async () => {
      const admin = createServiceRoleClient();
      const { data } = await admin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      return (data?.role as string | null) ?? null;
    },
    ["user-role", userId],
    { revalidate: 300, tags: [`user-role:${userId}`] },
  )();
