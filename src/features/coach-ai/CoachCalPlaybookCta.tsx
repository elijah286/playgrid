"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CoachAiIcon } from "./CoachAiIcon";
import { track } from "@/lib/analytics/track";
import { CheckoutLoadingOverlay } from "@/features/billing/CheckoutLoadingOverlay";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

const STORAGE_KEY = "coach-cal:playbook-cta-dismissed";
const GRADIENT = "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)";

/**
 * First-visit dismissible banner shown on the playbook editor for logged-in
 * users who don't yet have Coach Pro. Renders only on desktop (sm+).
 *
 * `show` is computed server-side: coach_ai beta is "all" AND user lacks the tier.
 */
export function CoachCalPlaybookCta({
  show,
  evalDays,
  userTier = null,
  coachProTrialUsed = false,
}: {
  show: boolean;
  evalDays: number;
  /** Lets the CTA switch between trial copy (free users) and upgrade copy
   *  (existing paid `coach` users who can't get a Stripe trial). */
  userTier?: SubscriptionTier | null;
  /** True iff this user already used the Coach Pro trial. Suppresses trial
   *  copy on the floating CTA — see CoachAiHeaderPreview for the same
   *  tri-state logic. */
  coachProTrialUsed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.__coachCalChatOpen);
  });
  // Suppress on just-claimed landings — the Customize dialog is the
  // primary surface in that moment, and stacking a marketing card under
  // it reads as noise. Captured once at mount because the page header
  // strips ?customize=1 from the URL on its first render; useSearchParams
  // would race that strip and lose the signal before the 1.8s delay
  // fires. The next page load (or hard refresh) has no param, so the
  // CTA shows normally.
  const [suppressedByCustomize] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("customize") === "1";
  });
  // Ref instead of state — the impression latch doesn't need to drive a
  // re-render and putting it in state trips
  // react-hooks/set-state-in-effect.
  const impressionLoggedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onState(e: CustomEvent<{ open: boolean }>) {
      setChatOpen(e.detail.open);
    }
    window.addEventListener("coach-cal:state-change", onState);
    return () => window.removeEventListener("coach-cal:state-change", onState);
  }, []);

  useEffect(() => {
    if (!show) return;
    if (suppressedByCustomize) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    // Small delay so it doesn't fire instantly on page load
    const id = setTimeout(() => {
      setVisible(true);
      // Fire the impression as the card actually becomes visible —
      // count people who saw it, not people who would have seen it if
      // they hadn't already dismissed. Paired with click / dismiss
      // events so the admin Engagement tab can compute:
      //   impression → click ratio = "interested"
      //   impression → dismiss ratio = "rejected"
      if (!impressionLoggedRef.current) {
        impressionLoggedRef.current = true;
        track({
          event: "coach_cal_cta_impression",
          target: "playbook_floating_card",
          metadata: { surface: "playbook_floating_card" },
        });
      }
    }, 1800);
    return () => clearTimeout(id);
  }, [show, suppressedByCustomize]);

  function dismiss() {
    setVisible(false);
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    track({
      event: "coach_cal_cta_dismiss",
      target: "playbook_floating_card",
      metadata: { surface: "playbook_floating_card" },
    });
  }

  // Card-hidden cases: the card itself doesn't render, but we still need
  // the overlay to be reachable in case the user clicked the CTA (which
  // sets visible=false instantly). Return the overlay-only branch so
  // pending=true still paints something on screen during the Stripe
  // round-trip; without this, the click vanishes the card with no
  // replacement and the coach is left staring at the unchanged page.
  if (!visible || chatOpen || suppressedByCustomize) {
    return <CheckoutLoadingOverlay open={pending} />;
  }

  // Cal folded into Team Coach 2026-05-27 — every paid tier has Cal.
  // The only audience for this CTA is `free` users.
  void userTier;
  void coachProTrialUsed;
  void evalDays;
  const ctaLabel = "Upgrade to Team Coach";
  const ctaSubtitle = "$9/month · cancel anytime";

  return (
    <>
      {/* Pending → fullscreen overlay so the click registers instantly
          even after we setVisible(false) above. Lives outside the card
          so it survives the card vanishing on click. */}
      <CheckoutLoadingOverlay open={pending} />
      <div
        role="dialog"
        aria-label="Try Coach Cal"
        className="fixed bottom-6 left-6 z-40 hidden sm:flex w-80 flex-col rounded-2xl border border-border bg-surface-raised shadow-xl"
      >
        {/* Gradient accent bar */}
        <div className="h-1 w-full rounded-t-2xl" style={{ background: GRADIENT }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background: GRADIENT }}
            >
              <CoachAiIcon className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Meet Coach Cal</p>
              <p className="text-[11px] text-muted">Your AI coaching partner</p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded p-0.5 text-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-foreground">
          Generate plays, adjust formations to your team&apos;s skill level, get
          strategy feedback vs. specific defenses — all from a single chat.
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            track({
              event: "coach_cal_cta_click",
              target: "playbook_floating_card",
              metadata: { surface: "playbook_floating_card", action: "subscribe" },
            });
            // Persist the dismissal so they don't see it again, but
            // skip the dismiss event — clicking through is its own
            // outcome and shouldn't double-count as a rejection.
            setVisible(false);
            try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
            // Free user: jump straight to embedded checkout — they
            // already declared Team Coach intent. /checkout handles
            // the active-sub guard and surfaces any error with a link
            // back to pricing.
            setErr(null);
            startTransition(() => {
              router.push("/checkout?tier=coach&interval=month");
            });
          }}
          data-web-only
          className="mt-3 flex w-full items-center justify-center rounded-xl py-2 text-sm font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-60"
          style={{ background: GRADIENT }}
        >
          {pending ? "Opening checkout…" : ctaLabel}
        </button>
        <p data-web-only className="mt-1.5 text-center text-[10px] text-muted">
          {ctaSubtitle}
        </p>
        {/* Native (iOS) shows no price or upgrade CTA — Apple 3.1.1. A
            neutral line keeps the card from ending on the description alone. */}
        <p data-native-only className="mt-3 text-center text-[12px] text-muted">
          Coach Cal isn’t included in your current plan.
        </p>
        {err ? (
          <p className="mt-1 text-center text-[10px] text-red-700">{err}</p>
        ) : null}
        </div>
      </div>
    </>
  );
}
