import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { CheckoutClient } from "./ui";

export const metadata: Metadata = {
  title: "Checkout",
  // Checkout is a transactional flow with no indexable content — keep it
  // out of search results so the canonical pricing page does the SEO work.
  robots: { index: false, follow: false },
};

type CheckoutSearchParams = {
  tier?: string;
  interval?: string;
};

function isValidTier(v: string | undefined): v is "coach" | "coach_ai" {
  return v === "coach" || v === "coach_ai";
}
function isValidInterval(v: string | undefined): v is "month" | "year" {
  return v === "month" || v === "year";
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<CheckoutSearchParams>;
}) {
  if (!hasSupabaseEnv()) redirect("/pricing");
  const params = await searchParams;
  const tier = params.tier;
  const interval = params.interval ?? "month";

  if (!isValidTier(tier) || !isValidInterval(interval)) {
    redirect("/pricing");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Send unauthenticated users through signup with a return-to so the
    // payment intent isn't lost. Pricing already gates the CTA on
    // auth, but a deep-linked /checkout URL needs the same fallback.
    const next = encodeURIComponent(`/checkout?tier=${tier}&interval=${interval}`);
    redirect(`/login?next=${next}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12" data-web-only>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Pricing
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        Complete your purchase
      </h1>
      <p className="mt-1 text-sm text-muted">
        Secured by Stripe. Cancel anytime from your account.
      </p>
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface-raised">
        <CheckoutClient tier={tier} interval={interval} />
      </div>
    </div>
  );
}
