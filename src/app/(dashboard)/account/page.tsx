import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { AccountClient } from "./ui";

export default async function AccountPage() {
  if (!hasSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
    <div className="space-y-6">
      <div>
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">Account</h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
        </p>
      </div>

      <AccountClient
        email={user.email ?? ""}
        displayName={displayName}
        avatarUrl={avatarUrl}
        entitlement={await getCurrentEntitlement()}
      />
    </div>
  );
}
