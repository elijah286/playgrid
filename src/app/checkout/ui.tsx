"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { createEmbeddedCheckoutSessionAction } from "@/app/actions/billing";

type Tier = "coach" | "coach_ai";
type Interval = "month" | "year";

export function CheckoutClient({
  tier,
  interval,
}: {
  tier: Tier;
  interval: Interval;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] =
    useState<Promise<StripeJs | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The Embedded Checkout session is single-use — guard against React 18+
  // double-invoked effects in dev creating two sessions and burning the
  // first one's client_secret before the iframe mounts.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const res = await createEmbeddedCheckoutSessionAction({ tier, interval });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setClientSecret(res.clientSecret);
      setStripePromise(loadStripe(res.publishableKey));
    })();
  }, [tier, interval]);

  // Memoize options so EmbeddedCheckoutProvider doesn't re-init on every
  // render (it warns + reloads the iframe when options identity changes).
  const options = useMemo(
    () => (clientSecret ? { clientSecret } : null),
    [clientSecret],
  );

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-danger">{error}</p>
        <p className="mt-3 text-xs text-muted">
          <Link href="/pricing" className="text-primary hover:underline">
            ← Back to pricing
          </Link>
        </p>
      </div>
    );
  }

  if (!options || !stripePromise) {
    return (
      <div className="flex min-h-[480px] items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
          Preparing secure checkout…
        </div>
      </div>
    );
  }

  return (
    <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
