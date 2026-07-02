"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Star, X } from "lucide-react";
import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";
import { APP_STORE_ID, PLAY_STORE_ID } from "@/lib/native/appStore";
import {
  checkRatingEligibility,
  recordRatingOutcome,
  recordRatingPromptShown,
} from "@/app/actions/rating-prompt";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { track } from "@/lib/analytics/track";

const SHOWN_KEY = "playgrid:rating-nudge-shown";

/** Coarse store bucket for outcome logging + review deep links. */
function storePlatform(): "ios" | "android" {
  return nativePlatform() === "android" ? "android" : "ios";
}

function ratingUrl(): string {
  if (storePlatform() === "android") {
    // Opens the Play Store app directly to the rating sheet.
    return `market://details?id=${PLAY_STORE_ID}&showAllReviews=true`;
  }
  // iOS: deep-links into the App Store rating sheet.
  return `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`;
}

/**
 * Steps of the nudge. We gate on sentiment BEFORE inviting a public review —
 * the well-worn "are you enjoying the app?" pattern — so only happy coaches are
 * sent to the store and unhappy ones are quietly routed to private feedback
 * instead of a 1-star review.
 *
 *   ask      → "Enjoying XO Gridmaker?"  Yes → rate,  Not really → feedback
 *   rate     → invite the App Store rating (happy path)
 *   feedback → collect private feedback (unhappy path)
 *   thanks   → confirmation after feedback is sent
 */
type Step = "ask" | "rate" | "feedback" | "thanks";

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
 *
 * Every terminal outcome (left a review / dismissed / sent feedback) is
 * reported to the site-admin inbox — see recordRatingOutcome and, for the
 * unhappy path, submitFeedbackAction's 'feedback_received' notice.
 */
export function RatingNudge() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<Step>("ask");
  const [sentiment, setSentiment] = useState<"positive" | "negative" | "unknown">(
    "unknown",
  );
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  // Guards against double-logging an outcome (e.g. a dismiss firing after a
  // rate). Exactly one terminal outcome is recorded per prompt.
  const settled = useRef(false);

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

  function close() {
    setShow(false);
  }

  /** Coach closed/skipped without leaving a review. Logged once. */
  function dismiss() {
    if (!settled.current) {
      settled.current = true;
      track({ event: "rating_nudge_dismiss", target: "rating_nudge" });
      void recordRatingOutcome("dismissed", storePlatform(), sentiment);
    }
    close();
  }

  function onEnjoyingYes() {
    setSentiment("positive");
    setStep("rate");
    track({ event: "rating_nudge_enjoy_yes", target: "rating_nudge" });
  }

  function onEnjoyingNo() {
    setSentiment("negative");
    setStep("feedback");
    track({ event: "rating_nudge_enjoy_no", target: "rating_nudge" });
  }

  function openStore() {
    if (!settled.current) {
      settled.current = true;
      track({ event: "rating_nudge_rate", target: "rating_nudge" });
      void recordRatingOutcome("rated", storePlatform(), "positive");
    }
    window.location.href = ratingUrl();
    close();
  }

  async function sendFeedback() {
    const text = feedback.trim();
    if (!text || sending) return;
    setSending(true);
    setFeedbackError(null);
    const res = await submitFeedbackAction(text);
    setSending(false);
    if (!res.ok) {
      setFeedbackError(res.error);
      return;
    }
    // Feedback insert already emits its own 'feedback_received' admin notice, so
    // mark settled to suppress a redundant dismiss log.
    settled.current = true;
    track({ event: "rating_nudge_feedback", target: "rating_nudge" });
    setStep("thanks");
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

        {step === "ask" && (
          <>
            <h2 className="text-base font-bold leading-snug text-foreground">
              Enjoying XO Gridmaker?
            </h2>
            <p className="mt-1 text-sm leading-snug text-muted">
              We&apos;d love to know how it&apos;s going for you and your team.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={onEnjoyingYes}
                className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              >
                Yes, loving it!
              </button>
              <button
                type="button"
                onClick={onEnjoyingNo}
                className="flex w-full items-center justify-center rounded-xl border border-border py-2 text-sm font-medium text-foreground transition hover:bg-foreground/5"
              >
                Not really
              </button>
            </div>
          </>
        )}

        {step === "rate" && (
          <>
            <h2 className="text-base font-bold leading-snug text-foreground">
              Awesome — mind leaving a rating?
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
          </>
        )}

        {step === "feedback" && (
          <>
            <h2 className="text-base font-bold leading-snug text-foreground">
              Sorry to hear that — what can we fix?
            </h2>
            <p className="mt-1 text-sm leading-snug text-muted">
              Tell us what&apos;s not working and we&apos;ll get on it. This goes
              straight to our team.
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="What would make this better?"
              className="mt-3 w-full resize-none rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-primary"
            />
            {feedbackError && (
              <p className="mt-1 text-xs text-danger">{feedbackError}</p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={sendFeedback}
                disabled={!feedback.trim() || sending}
                className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send feedback"}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="flex w-full items-center justify-center rounded-xl py-2 text-sm text-muted transition hover:text-foreground"
              >
                Not now
              </button>
            </div>
          </>
        )}

        {step === "thanks" && (
          <>
            <h2 className="text-base font-bold leading-snug text-foreground">
              Thank you!
            </h2>
            <p className="mt-1 text-sm leading-snug text-muted">
              We really appreciate you taking the time — we read every note.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={close}
                className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
