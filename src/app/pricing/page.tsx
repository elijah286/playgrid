import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { getCoachAiTierEnabled } from "@/lib/site/pricing-config";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import { getSeatDefaults } from "@/lib/site/seat-defaults-config";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import type { Entitlement } from "@/lib/billing/entitlement";
import { PricingClient } from "./ui";
import { withFullContext } from "@/lib/seo/ld-json";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple XO Gridmaker plans for coaches and teams. Free to start, with paid tiers that scale as you design more plays, share more playbooks, and coach more athletes.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "XO Gridmaker pricing — plans for coaches and teams",
    description:
      "Free to start. Paid plans scale with how you use XO Gridmaker — more plays, more playbooks, more athletes.",
    url: "/pricing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "XO Gridmaker pricing — plans for coaches and teams",
    description:
      "Free to start. Paid plans scale with how you use XO Gridmaker.",
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

  const [coachAiEnabled, freeMaxPlays, seatDefaults, coachAiEvalDays] = await Promise.all([
    getCoachAiTierEnabled(),
    getFreeMaxPlaysPerPlaybook(),
    getSeatDefaults(),
    getCoachAiEvalDays(),
  ]);
  const isAuthed = user !== null;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Pricing", item: "/pricing" },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(breadcrumbLd)) }}
      />
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
          Simple plans that scale with how you use XO Gridmaker. Cancel anytime.
        </p>
      </div>
      {/* In-app (Capacitor): show a neutral notice instead of the Stripe-driven
          PricingClient. Apple Guideline 3.1.1 / 3.1.3(b) forbids both in-app
          links to external digital-subscription purchases *and* communications
          that "directly or indirectly target iOS users to use a purchasing
          method other than in-app purchase". The previous copy violated the
          second clause by naming xogridmaker.com as the place to subscribe —
          this rewrite keeps the page reachable (so reviewers don't see a 404)
          without naming any external purchase path, mentioning subscriptions,
          or implying that paid functionality is available elsewhere. */}
      <div data-native-only>
        <div className="rounded-2xl border border-border bg-surface-raised p-6 text-sm text-foreground">
          <p className="font-semibold">Solo Coach — Free</p>
          <p className="mt-2 text-muted">
            The free plan includes all the play-design tools described in the
            App Store listing. Plan management isn&rsquo;t available in this
            version of the app.
          </p>
        </div>
      </div>
      <div data-web-only>
        <PricingClient
          entitlement={entitlement}
          showCoachAi={coachAiEnabled}
          isAuthed={isAuthed}
          freeMaxPlays={freeMaxPlays}
          seatDefaults={seatDefaults}
          coachAiEvalDays={coachAiEvalDays}
        />
      </div>
    </div>
  );
}
