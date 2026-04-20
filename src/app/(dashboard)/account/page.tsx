import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export default async function AccountPage() {
  if (!hasSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

      <div className="rounded-2xl border border-border bg-surface-raised p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-inset">
          <CreditCard className="size-6 text-muted" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">Billing &amp; plan</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Payment plans and billing management will live here. Nothing to configure yet — PlayGrid
          is free while we&rsquo;re in early access.
        </p>
      </div>
    </div>
  );
}
