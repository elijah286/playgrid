"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Gift, X } from "lucide-react";
import {
  getReferralAnnouncementAction,
  markReferralAnnouncementSeenAction,
  type ReferralAnnouncement,
} from "@/app/actions/referral";
import { track } from "@/lib/analytics/track";
import {
  useFirstRunModalSlot,
  FIRST_RUN_PRIORITY,
} from "@/components/onboarding/FirstRunModalQueue";

const SHOWN_KEY = "playgrid:referral-announcement-shown";

/**
 * One-time "you can now earn rewards for referring coaches" announcement.
 *
 * Mounted once in the dashboard layout (web + native). Self-gates via
 * getReferralAnnouncementAction, which enforces: program live for this user,
 * never seen before, and — critically — the shared 14-day engagement cooldown
 * that also gates the App Store review nudge. That shared cooldown, plus the
 * review nudge deferring while this announcement is still owed, is how a coach
 * never gets both asks at once. The localStorage key prevents a double-show
 * within a session before the server timestamp lands.
 *
 * Lowest-priority first-run modal: it defers through the queue behind the terms
 * gate and the native welcome, and only stamps itself seen (server + local) when
 * it actually reaches the screen — so being deferred never burns the one-shot.
 */
export function ReferralAnnouncementNudge() {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<ReferralAnnouncement | null>(null);
  const markedRef = useRef(false);

  // Eligibility only — do NOT mark seen here; the queue may keep us deferred.
  useEffect(() => {
    let cancelled = false;

    async function checkEligibility() {
      try {
        if (localStorage.getItem(SHOWN_KEY) === "1") return;
      } catch {
        /* storage unavailable — continue */
      }

      const announcement = await getReferralAnnouncementAction();
      if (cancelled || !announcement) return;
      setData(announcement);
    }

    void checkEligibility();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const visible = useFirstRunModalSlot(
    FIRST_RUN_PRIORITY.referralAnnouncement,
    !!data,
  );

  // Stamp seen exactly once, and only when actually shown — this is what makes
  // the one-shot fire on display rather than on eligibility.
  useEffect(() => {
    if (!visible || !data || markedRef.current) return;
    markedRef.current = true;
    try {
      localStorage.setItem(SHOWN_KEY, "1");
    } catch {
      /* ignore */
    }
    void markReferralAnnouncementSeenAction();
    track({ event: "referral_announcement_view", target: "referral_announcement" });
  }, [visible, data]);

  if (!visible || !data) return null;

  function dismiss() {
    track({ event: "referral_announcement_dismiss", target: "referral_announcement" });
    setData(null);
  }

  function getLink() {
    track({ event: "referral_announcement_cta", target: "referral_announcement" });
    setData(null);
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
          Earn{" "}
          <span className="font-semibold text-foreground">{data.perReferralLabel}</span>{" "}
          when a coach signs up from your link and gets started.
          {data.recipientTrialDays > 0
            ? ` They start with ${data.recipientTrialDays} days of Team Coach, too.`
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
