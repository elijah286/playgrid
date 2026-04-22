import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { PricingClient } from "./ui";

export default async function PricingPage() {
  if (!hasSupabaseEnv()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const entitlement = await getCurrentEntitlement();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/account"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Account
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
          Pricing
        </h1>
        <p className="mt-1 text-sm text-muted">
          Simple plans that scale with how you use PlayGrid. Cancel anytime.
        </p>
      </div>
      <PricingClient entitlement={entitlement} />
    </div>
  );
}
