import { storeReviewsUrl } from "@/lib/native/appStore";

/**
 * Rating-nudge outcome → admin system_notice.
 *
 * Pure projection so it can be unit-tested without a DB. The server action
 * (recordRatingOutcome) resolves the coach's identity + platform, calls this to
 * shape the row, then inserts it with the service-role client. See the
 * 20260702130000 migration for why these ride the existing system_notices feed.
 *
 * Only the two terminal outcomes that DON'T already produce a notice live here:
 *  - "rated"     — the coach was happy and was sent to the store to review.
 *  - "dismissed" — the coach closed the prompt without reviewing.
 * The unhappy → private-feedback path is handled by submitFeedbackAction, which
 * emits its own 'feedback_received' notice, so it is intentionally absent here.
 */
export type RatingOutcome = "rated" | "dismissed";

/** How the coach answered the "enjoying the app?" gate, when known. */
export type RatingSentiment = "positive" | "negative" | "unknown";

export type RatingPromptNotice = {
  kind: "review_prompt";
  severity: "info";
  body: string;
  href: string;
  detail: Record<string, unknown>;
};

export function buildRatingPromptNotice(args: {
  who: string;
  outcome: RatingOutcome;
  platform: "ios" | "android";
  sentiment?: RatingSentiment;
}): RatingPromptNotice {
  const who = args.who.trim() || "Someone";
  const sentiment = args.sentiment ?? "unknown";
  const detail: Record<string, unknown> = {
    outcome: args.outcome,
    sentiment,
    platform: args.platform,
  };

  if (args.outcome === "rated") {
    return {
      kind: "review_prompt",
      severity: "info",
      // Apple/Google give us no submit callback, so "left a review" is really
      // "was sent to the store to review" — phrased plainly, and the href is
      // the public reviews page (the closest thing to a link to that review).
      body: `${who} is enjoying the app and went to leave an App Store review`,
      href: storeReviewsUrl(args.platform),
      detail,
    };
  }

  // dismissed — note the sentiment so an admin can tell "happy but didn't get
  // around to it" from "wasn't feeling it".
  const tail =
    sentiment === "negative"
      ? " (wasn’t enjoying the app)"
      : sentiment === "positive"
        ? " (said they were enjoying the app)"
        : "";
  return {
    kind: "review_prompt",
    severity: "info",
    body: `${who} saw the rating prompt and dismissed it${tail}`,
    href: "/settings?tab=users",
    detail,
  };
}

/**
 * Rating-nudge SEND → admin system_notice.
 *
 * Records that the nudge was shown to a coach — the top of the funnel — so an
 * admin can see who was invited to rate and when, independently of whether they
 * ever act on it. Without this, a nudge that's shown and then ignored leaves no
 * trace in the admin inbox (the outcome notices only fire when the coach taps
 * through), so "whether or not they did anything" couldn't be answered.
 *
 * Rides the same 'review_prompt' kind as the outcome notices (differentiated by
 * detail.outcome = 'shown'), so it needs no new migration and renders in the
 * admin inbox with the existing 'review' badge. Kept OUT of
 * ADMIN_PUSH_NOTICE_KINDS for the same reason the outcomes are — it's in-app
 * telemetry, not a device-interrupt event.
 */
export function buildRatingShownNotice(args: {
  who: string;
  platform: "ios" | "android";
}): RatingPromptNotice {
  const who = args.who.trim() || "Someone";
  return {
    kind: "review_prompt",
    severity: "info",
    body: `${who} was shown the rating prompt`,
    href: "/settings?tab=users",
    detail: { outcome: "shown", platform: args.platform },
  };
}
