"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { CoachAiIcon } from "./CoachAiIcon";
import { ENTRY_POINTS, previewCtaLabel, type CoachCalEntryPointId } from "./entry-points";
import { track } from "@/lib/analytics/track";
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
  onCtaClick,
}: {
  entryPoint: CoachCalEntryPointId;
  prompt: string;
  evalDays: number;
  userTier?: SubscriptionTier | null;
  onCtaClick?: () => void;
}) {
  const config = ENTRY_POINTS[entryPoint];
  // Paid Team Coach users can't get a trial — Stripe restricts trials to
  // first-time subscribers, and the upgrade flow charges proration today.
  const upgradeOnly = userTier === "coach";
  const ctaLabel = upgradeOnly
    ? "Upgrade to Coach Pro"
    : previewCtaLabel(config, evalDays);
  const ctaSubtitle = upgradeOnly
    ? "Prorated for this billing period · cancel anytime"
    : "No charge today · cancel anytime";
  const inputPlaceholder = upgradeOnly
    ? "Upgrade to Coach Pro to chat with Coach Cal"
    : "Start your free trial to chat with Coach Cal";
  const lockBadge = upgradeOnly ? "Coach Pro required" : "Trial required";
  const footnote = upgradeOnly
    ? "Coach Cal is included with Coach Pro — upgrade from your current Team Coach plan to unlock it."
    : `Get the full Coach Cal experience with a ${evalDays}-day free trial — no charge today.`;
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm leading-snug text-white">
            {prompt}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: GRADIENT }}
          >
            <CoachAiIcon className="size-5 text-primary" bare />
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-3 py-2.5 text-sm text-foreground ring-1 ring-border">
            <p className="leading-snug">{config.preview.leadIn}</p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Other things Coach Cal can do
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-snug">
              {config.preview.capabilities.map((cap) => (
                <li key={cap}>{cap}</li>
              ))}
            </ul>
            <Link
              href="/pricing"
              onClick={() => {
                track({
                  event: "coach_cal_cta_click",
                  target: "preview_chat_trial",
                  metadata: {
                    surface: "preview_chat",
                    entry_point: entryPoint,
                    action: upgradeOnly ? "upgrade" : "start_trial",
                  },
                });
                onCtaClick?.();
              }}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold text-white shadow transition hover:opacity-90"
              style={{ background: TRIAL_GRADIENT }}
            >
              {ctaLabel}
            </Link>
            <p className="mt-1.5 text-center text-[10px] text-muted">
              {ctaSubtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface-raised px-3 pb-3 pt-2">
        <div className="relative">
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
