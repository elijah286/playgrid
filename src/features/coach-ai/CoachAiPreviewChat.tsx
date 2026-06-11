"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { CoachAiIcon } from "./CoachAiIcon";
import { ENTRY_POINTS, previewCtaLabel, type CoachCalEntryPointId } from "./entry-points";
import { track } from "@/lib/analytics/track";
import { CheckoutLoadingOverlay } from "@/features/billing/CheckoutLoadingOverlay";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";
// Bold trial-CTA gradient — the brand pastel + white text reads as faded;
// the trial button is the conversion target so it gets the full-saturation
// blue/purple to match the playbook floating CTA.
const TRIAL_GRADIENT = "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)";

/**
 * Read-only chat surface shown when a non-entitled user clicks an in-app
 * Coach Cal CTA. The user sees what they "asked" + a tailored upsell that
 * explains what Cal would have done + a trial CTA.
 *
 * Input is disabled — the only path forward is the trial link. This is
 * intentional: the goal is to convert curiosity into a trial sign-up
 * without dangling a real chat that won't actually work.
 */
export function CoachAiPreviewChat({
  entryPoint,
  prompt,
  evalDays,
  userTier = null,
  coachProTrialUsed = false,
  onCtaClick,
}: {
  entryPoint: CoachCalEntryPointId;
  prompt: string;
  evalDays: number;
  userTier?: SubscriptionTier | null;
  coachProTrialUsed?: boolean;
  onCtaClick?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const config = ENTRY_POINTS[entryPoint];
  // Three states for the CTA copy — see CoachAiHeaderPreview for the
  // rationale (paid coach → upgrade; free + trial used → subscribe; free
  // + trial available → start trial). The middle state suppresses the
  // entry-point-specific trial label since the entry-point templates all
  // bake "Start X-day free trial" into the copy.
  // Cal folded into the $9 Team Coach tier (2026-05-27) — every paid
  // tier gets Cal access. Lock screen only shows for `free` users.
  void userTier;
  void coachProTrialUsed;
  void evalDays;
  void previewCtaLabel;
  const ctaLabel = "Upgrade to Team Coach";
  const ctaSubtitle = "$9/month · cancel anytime";
  const inputPlaceholder = "Upgrade to Team Coach to chat with Coach Cal";
  const lockBadge = "Team Coach required";
  const footnote = "Coach Cal is included with Team Coach at $9/month — 50 messages/month, plus unlimited plays, Game Mode, and team features.";
  function handleCtaClick() {
    track({
      event: "coach_cal_cta_click",
      target: "preview_chat_trial",
      metadata: { surface: "preview_chat", entry_point: entryPoint, action: "subscribe" },
    });
    setErr(null);
    onCtaClick?.();
    startTransition(() => {
      router.push("/checkout?tier=coach&interval=month");
    });
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Pending → fullscreen overlay so the click registers instantly
          even when Cal closes / Stripe round-trip takes 1-3s. */}
      <CheckoutLoadingOverlay open={pending} />
      {/* Conversation surface — laid out as a real Cal chat. The user
          "asks" the entry-point prompt, Cal "answers" with the
          tailored upsell lead-in, then sends a follow-up listing the
          other things it can do. Each piece is a separate chat bubble
          (NOT a card-in-card) so the preview reads as a real Cal
          session instead of a marketing widget mounted inside Cal. */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* User's "asked" prompt */}
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm leading-snug text-white">
            {prompt}
          </div>
        </div>

        {/* Cal's lead-in response */}
        <div className="flex items-start gap-2">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: GRADIENT }}
          >
            <CoachAiIcon className="size-5 text-primary" bare />
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-3 py-2 text-sm leading-snug text-foreground ring-1 ring-border">
            {config.preview.leadIn}
          </div>
        </div>

        {/* Cal's follow-up "here's what else I can do" — second
            bubble in the same chat thread, with a smaller leading
            avatar so it visually reads as a continuation. */}
        <div className="flex items-start gap-2">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-lg opacity-0"
            aria-hidden
          />
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-3 py-2 text-sm leading-snug text-foreground ring-1 ring-border">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Other things Coach Cal can do
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-snug">
              {config.preview.capabilities.map((cap) => (
                <li key={cap}>{cap}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Footer band: trial CTA up top (the obvious next step), the
          disabled "input" below as a quieter reinforcement that
          chatting is gated. One band, one divider — replaces the
          two stacked bands the older layout had. */}
      <div className="border-t border-border bg-surface-raised px-3 pb-3 pt-3">
        <button
          data-web-only
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
