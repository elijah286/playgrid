"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Gift, X } from "lucide-react";
import { markReferralAnnouncementSeenAction } from "@/app/actions/referral";
import { track } from "@/lib/analytics/track";

/**
 * Presentational one-time "you can now earn rewards for referring coaches"
 * announcement. Eligibility and timing belong to EngagementAskHost; this
 * renders only after the host has won the engagement window, so mounting IS
 * being shown — which is exactly when the one-shot should burn.
 */
export function ReferralAsk({
  perReferralLabel,
  recipientTrialDays,
  onDone,
}: {
  perReferralLabel: string;
  recipientTrialDays: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markReferralAnnouncementSeenAction();
    track({ event: "referral_announcement_view", target: "referral_announcement" });
  }, []);

  function dismiss() {
    track({ event: "referral_announcement_dismiss", target: "referral_announcement" });
    onDone();
  }

  function getLink() {
    track({ event: "referral_announcement_cta", target: "referral_announcement" });
    onDone();
    router.push("/account");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New: referral rewards"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Gift className="size-5" />
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <h2 className="text-base font-bold leading-snug text-foreground">
          New — earn rewards for referring coaches
        </h2>
        <p className="mt-1 text-sm leading-snug text-muted">
          Earn <span className="font-semibold text-foreground">{perReferralLabel}</span>{" "}
          when a coach signs up from your link and gets started.
          {recipientTrialDays > 0
            ? ` They start with ${recipientTrialDays} days of Team Coach, too.`
            : ""}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={getLink}
            className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            Get your link
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="flex w-full items-center justify-center rounded-xl py-2 text-sm text-muted transition hover:text-foreground"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
