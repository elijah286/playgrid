import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { getCoachAiTierEnabled } from "@/lib/site/pricing-config";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import type { Entitlement } from "@/lib/billing/entitlement";
import { PricingClient } from "./ui";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple xogridmaker plans for coaches and teams. Free to start, with paid tiers that scale as you design more plays, share more playbooks, and coach more athletes.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "xogridmaker pricing — plans for coaches and teams",
    description:
      "Free to start. Paid plans scale with how you use xogridmaker — more plays, more playbooks, more athletes.",
    url: "/pricing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "xogridmaker pricing — plans for coaches and teams",
    description:
      "Free to start. Paid plans scale with how you use xogridmaker.",
  },
};

export default async function PricingPage() {
  let user: { id: string } | null = null;
  let entitlement: Entitlement | null = null;

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser) {
      user = { id: authUser.id };
      entitlement = await getCurrentEntitlement();
    }
  }

  const [coachAiEnabled, freeMaxPlays] = await Promise.all([
    getCoachAiTierEnabled(),
    getFreeMaxPlaysPerPlaybook(),
  ]);
  const isAuthed = user !== null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        {isAuthed && (
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Account
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Pricing
        </h1>
        <p className="mt-1 text-sm text-muted">
          Simple plans that scale with how you use xogridmaker. Cancel anytime.
        </p>
      </div>
      <PricingClient
        entitlement={entitlement}
        showCoachAi={coachAiEnabled}
        isAuthed={isAuthed}
        freeMaxPlays={freeMaxPlays}
      />
    </div>
  );
}
