"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Star, X } from "lucide-react";
import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";
import { APP_STORE_ID, PLAY_STORE_ID } from "@/lib/native/appStore";
import {
  checkRatingEligibility,
  recordRatingPromptShown,
} from "@/app/actions/rating-prompt";
import { track } from "@/lib/analytics/track";

const SHOWN_KEY = "playgrid:rating-nudge-shown";

function ratingUrl(): string {
  if (nativePlatform() === "android") {
    // Opens the Play Store app directly to the rating sheet.
    return `market://details?id=${PLAY_STORE_ID}&showAllReviews=true`;
  }
  // iOS: deep-links into the App Store rating sheet.
  return `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`;
}

/**
 * Surfaces an App Store rating nudge to native-app users who have hit a
 * meaningful engagement milestone. Mounts once in the dashboard layout and
 * re-checks on every navigation (pathname change) and on the custom
 * 'xo:rating-check' event dispatched by immediate triggers (print).
 *
 * Gates (all enforced server-side in checkRatingEligibility):
 *  - suggest_reviews site setting is not 'off'
 *  - If 'only_admins', user must be a site admin
 *  - Account age ≥ 7 days
 *  - Not shown in the last 365 days
 *  - At least one trigger has been recorded
 *
 * localStorage key prevents re-show within the same browser session even if
 * the server-side timestamp hasn't been written yet.
 */
export function RatingNudge() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAndMaybeShow() {
      if (!isNativeApp()) return;
      try {
        if (localStorage.getItem(SHOWN_KEY) === "1") return;
      } catch {
        // storage unavailable — continue
      }

      const eligible = await checkRatingEligibility();
      if (cancelled || !eligible) return;

      setShow(true);
      try {
        localStorage.setItem(SHOWN_KEY, "1");
      } catch {
        // ignore
      }
      void recordRatingPromptShown();
      track({ event: "rating_nudge_view", target: "rating_nudge" });
    }

    void checkAndMaybeShow();

    function onCheck() {
      void checkAndMaybeShow();
    }
    window.addEventListener("xo:rating-check", onCheck);

    return () => {
      cancelled = true;
      window.removeEventListener("xo:rating-check", onCheck);
    };
  }, [pathname]);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    track({ event: "rating_nudge_dismiss", target: "rating_nudge" });
  }

  function openStore() {
    track({ event: "rating_nudge_rate", target: "rating_nudge" });
    window.location.href = ratingUrl();
    dismiss();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rate XO Gridmaker"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Star className="size-5 fill-primary" />
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
          Loving XO Gridmaker?
        </h2>
        <p className="mt-1 text-sm leading-snug text-muted">
          A quick rating goes a long way — it helps other coaches find us and
          takes about 10 seconds.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={openStore}
            className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            Rate the app
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="flex w-full items-center justify-center rounded-xl py-2 text-sm text-muted transition hover:text-foreground"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
