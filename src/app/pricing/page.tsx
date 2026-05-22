import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getCurrentEntitlement, hasUsedCoachProTrial } from "@/lib/billing/entitlement";
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

  // Kick off the four site-settings reads immediately — they don't
  // depend on the user, so they can race the auth + entitlement chain
  // instead of waterfalling after it. On a cold render this turns
  // 3 sequential round-trips (auth → entitlement → settings) into 1.
  const settingsPromise = Promise.all([
    getCoachAiTierEnabled(),
    getFreeMaxPlaysPerPlaybook(),
    getSeatDefaults(),
    getCoachAiEvalDays(),
  ]);

  // Trial-used is a single subscriptions lookup; fire it speculatively
  // as soon as we know the user id (without waiting on entitlement)
  // and discard the result for non-free users where it doesn't apply.
  // Shaves another round-trip off the common "upgrade from Cal preview"
  // path, where the multi-second gap before the page paints made users
  // think the click hadn't worked.
  let trialUsedPromise: Promise<boolean> = Promise.resolve(false);

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser) {
      user = { id: authUser.id };
      trialUsedPromise = hasUsedCoachProTrial(authUser.id);
      entitlement = await getCurrentEntitlement();
    }
  }

  const [coachAiEnabled, freeMaxPlays, seatDefaults, coachAiEvalDays] =
    await settingsPromise;
  const isAuthed = user !== null;
  // Mirror the billing.ts trial gate so the Coach Pro CTA copy matches
  // what Stripe will actually do at checkout — if the user already used
  // the trial, label the button "Subscribe" not "Start free trial".
  const coachProTrialUsed =
    user && (entitlement?.tier ?? "free") === "free"
      ? await trialUsedPromise
      : false;

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
          coachProTrialUsed={coachProTrialUsed}
        />
      </div>
    </div>
  );
}
