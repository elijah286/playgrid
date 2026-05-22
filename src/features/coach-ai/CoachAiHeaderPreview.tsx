"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { CoachAiIcon } from "./CoachAiIcon";
import { track } from "@/lib/analytics/track";
import { CheckoutLoadingOverlay } from "@/features/billing/CheckoutLoadingOverlay";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { cn } from "@/lib/utils";

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";
const TRIAL_GRADIENT = "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)";

type CoachCalDemo = { user: string; cal: string };

const COACH_CAL_DEMOS: CoachCalDemo[] = [
  {
    user: "Draw me a curl-flat against Cover-3.",
    cal: "Done — here's the diagram with reads. Want me to add it to your playbook?",
  },
  {
    user: "What plays beat a 5-2 defense?",
    cal: "Try Stick, Curl-Flat, and Slants — your QB has the most time on those fronts.",
  },
  {
    user: "Build a 60-min practice for Tuesday.",
    cal: "10 warm-up · 20 individual · 20 team install · 10 conditioning. Saved to Practice Plans.",
  },
  {
    user: "Schedule our game vs Riverside, Sat 2 PM.",
    cal: "Added to Calendar with a 24-hr reminder. RSVP link sent to roster.",
  },
  {
    user: "Adjust this play for a younger team.",
    cal: "Simplified routes and added a hot read. Want me to apply across the playbook?",
  },
];

function leadForPath(pathname: string | null): string {
  if (!pathname) return "help you build your playbook, plan practices, and more.";
  if (/^\/plays\/[^/]+\/edit/.test(pathname)) {
    return "draw this play, suggest counters, or tune it for your team.";
  }
  if (/^\/playbooks\/[^/]+\/print/.test(pathname)) {
    return "design call sheets and wristbands you can print today.";
  }
  if (/^\/playbooks\/[^/]+/.test(pathname)) {
    return "build out this playbook, plan practices, and schedule games.";
  }
  if (pathname === "/home" || pathname.startsWith("/home")) {
    return "build playbooks, plan practices, and run your season.";
  }
  return "help you build your playbook, plan practices, and schedule games.";
}

/**
 * Welcome chat surface shown when a non-entitled user opens Coach Cal from
 * the header icon (no specific entry-point CTA). Mirrors the entry-point
 * preview shell — Cal greeting bubble, demo strip, trial CTA, disabled
 * input — but with general path-aware copy instead of a tailored upsell.
 */
export function CoachAiHeaderPreview({
  evalDays,
  userTier = null,
  coachProTrialUsed = false,
  onCtaClick,
}: {
  evalDays: number;
  userTier?: SubscriptionTier | null;
  coachProTrialUsed?: boolean;
  onCtaClick?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  // Three states for the CTA copy:
  //   - Paid Team Coach (`coach`)        → Upgrade (proration applies, no trial)
  //   - Free + trial already used        → Subscribe (Stripe refuses a 2nd trial)
  //   - Free + trial available           → Start trial (no charge today)
  // The middle state mirrors the billing.ts gate so we don't promise "no
  // charge today" to someone who'd be billed $25 at checkout.
  const upgradeOnly = userTier === "coach";
  const trialUsed = !upgradeOnly && coachProTrialUsed;
  const ctaLabel = upgradeOnly
    ? "Upgrade to Coach Pro"
    : trialUsed
      ? "Subscribe to Coach Pro"
      : `Start ${evalDays}-day free trial`;
  const ctaSubtitle = upgradeOnly
    ? "Prorated for this billing period · cancel anytime"
    : trialUsed
      ? "$25/month · cancel anytime"
      : "No charge today · cancel anytime";
  const inputPlaceholder = upgradeOnly
    ? "Upgrade to Coach Pro to chat with Coach Cal"
    : trialUsed
      ? "Subscribe to Coach Pro to chat with Coach Cal"
      : "Start your free trial to chat with Coach Cal";
  const lockBadge = upgradeOnly || trialUsed ? "Coach Pro required" : "Trial required";
  const footnote = upgradeOnly
    ? "Coach Cal is included with Coach Pro — upgrade from your current Team Coach plan to unlock it."
    : trialUsed
      ? "Coach Cal is included with Coach Pro — $25/month gets you 200 messages plus everything in Team Coach."
      : `Get the full Coach Cal experience with a ${evalDays}-day free trial — no charge today.`;
  function handleCtaClick() {
    const action = upgradeOnly ? "upgrade" : trialUsed ? "subscribe" : "start_trial";
    track({
      event: "coach_cal_cta_click",
      target: "header_chat_trial",
      metadata: { surface: "header_chat", action, path: pathname ?? null },
    });
    // Paid Team Coach users must go through /pricing — the upgrade
    // path needs the proration modal, and the direct checkout action
    // refuses for users with an active sub.
    if (upgradeOnly) {
      onCtaClick?.();
      router.push("/pricing");
      return;
    }
    // Free + Coach Pro intent is unambiguous (the coach just clicked
    // "Start trial" / "Subscribe"). Skip the /pricing comparison shop
    // and jump straight to embedded checkout — one less click, no
    // second-guessing the decision. /checkout handles the active-sub
    // guard and surfaces any error with a link back to pricing.
    setErr(null);
    onCtaClick?.();
    startTransition(() => {
      router.push("/checkout?tier=coach_ai&interval=month");
    });
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Pending → fullscreen overlay so the click registers instantly
          even when Cal closes / Stripe round-trip takes 1-3s. */}
      <CheckoutLoadingOverlay open={pending} />
      {/* Conversation surface — laid out as a real Cal chat so the
          preview reads as "this is what Coach Cal looks like" rather
          than a card-inside-a-card marketing surface. The greeting is
          one chat bubble, the demo strip below is rendered as actual
          user/Cal turns (not nested inside another card), and the
          trial CTA sits below the conversation as a clear action
          instead of being crammed inside Cal's bubble. */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* Cal greeting bubble */}
        <div className="flex items-start gap-2">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: GRADIENT }}
          >
            <CoachAiIcon className="size-5 text-primary" bare />
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-3 py-2 text-sm leading-snug text-foreground ring-1 ring-border">
            Coach Cal can {leadForPath(pathname)}
          </div>
        </div>

        {/* Cycling demo conversation — rendered as a real user→Cal
            exchange. Each cycle, the user "asks" something and Cal
            "answers" so coaches see what natural Cal interactions
            look like. The bubbles are styled identically to real
            chat bubbles (no wrapping card) so it reads as a
            continuation of the conversation, not a separate widget. */}
        <CoachCalDemoStrip />
      </div>

      {/* Footer band: trial CTA up top (the obvious next step), the
          disabled "input" below as a quieter reinforcement that
          chatting is gated. One band, one divider — replaces the
          two stacked bands the older layout had, which looked like
          another "window within the window". */}
      <div className="border-t border-border bg-surface-raised px-3 pb-3 pt-3">
        <button
          type="button"
          disabled={pending}
          onClick={handleCtaClick}
          className="inline-flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold text-white shadow transition hover:opacity-90 disabled:opacity-60"
          style={{ background: TRIAL_GRADIENT }}
        >
          {pending ? "Opening checkout…" : ctaLabel}
        </button>
        <p className="mt-1.5 text-center text-[10px] text-muted">
          {ctaSubtitle}
        </p>
        {err ? (
          <p className="mt-1 text-center text-[10px] text-red-700">{err}</p>
        ) : null}

        <div className="relative mt-3">
          <textarea
            rows={2}
            disabled
            placeholder={inputPlaceholder}
            className="w-full cursor-not-allowed resize-none rounded-xl bg-surface-inset px-3 py-2 pr-24 text-sm text-foreground/40 ring-1 ring-inset ring-black/5"
          />
          <div className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-surface-raised/70 px-1.5 py-0.5 text-[10px] text-muted ring-1 ring-border">
            <Lock className="size-3" /> {lockBadge}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          {footnote}
        </p>
      </div>
    </div>
  );
}

/**
 * Cycling user→Cal exchange shown beneath the greeting in the preview
 * chat. Renders as real chat bubbles at the same scale as everything
 * else in the panel (NOT inside a wrapping card) so the conversation
 * reads as one continuous Cal session instead of "a marketing widget
 * mounted inside the chat". The fade-in keys off the demo index so
 * each rotation feels like a new message landing.
 */
function CoachCalDemoStrip() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % COACH_CAL_DEMOS.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);
  const demo = COACH_CAL_DEMOS[idx];
  return (
    <>
      <style>{`@keyframes calDemoFade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }`}</style>
      <div
        key={`${idx}-u`}
        className="flex justify-end [animation:calDemoFade_400ms_ease-out]"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm leading-snug text-white">
          {demo.user}
        </div>
      </div>
      <div
        key={`${idx}-c`}
        className="flex items-start gap-2 [animation:calDemoFade_400ms_ease-out]"
      >
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: GRADIENT }}
        >
          <CoachAiIcon className="size-5 text-primary" bare />
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-3 py-2 text-sm leading-snug text-foreground ring-1 ring-border">
          {demo.cal}
        </div>
      </div>
      <div className="flex justify-center gap-1 pt-1">
        {COACH_CAL_DEMOS.map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-1 rounded-full transition-colors",
              i === idx ? "bg-primary" : "bg-muted/30",
            )}
          />
        ))}
      </div>
    </>
  );
}
