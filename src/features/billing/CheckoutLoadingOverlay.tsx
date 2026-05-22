"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * Fullscreen blocking overlay shown while `createCheckoutSessionAction` is
 * in-flight. The action takes 1–3 seconds in practice (Supabase auth + DB
 * lookup + the slow Stripe API round-trip to create the checkout session),
 * which is long enough that without an obvious "we heard you" signal,
 * coaches read it as broken and click again.
 *
 * Specifically targets two surfaces that lost visible feedback after we
 * moved Cal CTAs to direct-checkout (skipping /pricing's loading
 * skeleton): the CoachAi preview panel (the disabled-button state is easy
 * to miss when Cal is in float / docked mode) and the floating
 * CoachCalPlaybookCta (which `setVisible(false)`s instantly on click so
 * the card just vanishes and nothing replaces it). With this overlay,
 * the click → first-frame latency is one paint instead of one round-trip.
 *
 * Renders via `createPortal` to document.body so it sits above every
 * layout, including the docked Cal panel which has its own portal. Mounts
 * empty on the server / before hydration to avoid the SSR/CSR mismatch
 * that React would otherwise log for a window-conditional portal.
 */
export function CheckoutLoadingOverlay({
  open,
  label = "Opening secure checkout…",
}: {
  open: boolean;
  /** Optional override for the message; default matches the Cal CTA
   *  use-case but a different surface (e.g. a future Manage Billing
   *  spinner) could pass its own. */
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || !open || typeof document === "undefined") return null;
  return createPortal(
    <div
      // z-[100] beats Cal's docked panel (z-50) and every other modal
      // we ship. Pointer-events on so an accidental second click on
      // the underlying CTA can't fire while Stripe is loading — once
      // the user sees this overlay, the only way out is the Stripe
      // page or the browser back button.
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black/40 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex items-center gap-2.5 rounded-2xl bg-surface-raised px-5 py-3.5 text-sm font-medium text-foreground shadow-2xl ring-1 ring-black/5">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        <span>{label}</span>
      </div>
    </div>,
    document.body,
  );
}
