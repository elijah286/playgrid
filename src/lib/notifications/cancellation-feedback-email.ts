import { Resend } from "resend";
import { getStoredResendConfig } from "@/lib/site/resend-config";

/**
 * One-shot transactional email sent when a paying coach cancels their
 * subscription. Two purposes:
 *   1. Confirm the cancellation (what happens, when access ends).
 *   2. Ask for a one-line reason — replies route back to admin@xogridmaker.com
 *      so the founder reads them directly.
 *
 * Sent at most once per subscription (the webhook UPDATEs the
 * `cancellation_feedback_email_sent_at` column atomically before calling
 * here, so Stripe retries / duplicate events can't double-send).
 *
 * Not a campaign — no opt-in / unsubscribe link. It's the email a normal
 * cancel-confirmation would carry, just with feedback bait attached.
 */

/** From address overridden specifically for this template so replies route
 *  to a real founder-readable inbox regardless of what the global Resend
 *  "from" is configured as. */
export const CANCELLATION_FROM_EMAIL = "XO Gridmaker <admin@xogridmaker.com>";

export type SendCancellationFeedbackInput = {
  toEmail: string;
  /** First name from profile display_name, or null → falls back to "there". */
  firstName: string | null;
  /** Date access ends — usually current_period_end. Formatted for the body. */
  periodEndDate: Date | null;
};

/** A short, human, date-only label: "June 2", "December 14", etc. Falls
 *  back gracefully when periodEndDate is null (rare edge — sub canceled
 *  with no future period). */
export function formatPeriodEnd(date: Date | null): string {
  if (!date) return "the end of your current billing period";
  try {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "America/Chicago",
    });
  } catch {
    return "the end of your current billing period";
  }
}

export function buildSubject(): string {
  return "Confirming your cancellation — and one quick ask";
}

export function buildPlainText(input: SendCancellationFeedbackInput): string {
  const first = input.firstName?.trim() || "there";
  const endLabel = formatPeriodEnd(input.periodEndDate);
  return [
    `Hi ${first},`,
    "",
    `Confirming your XO Gridmaker subscription has been canceled. Your access stays active through ${endLabel}; after that it won't renew and you won't be billed again. Your account, playbooks, plays, and roster all stay where they are — if you ever want to come back (next season, new team, whenever), everything's right where you left it.`,
    "",
    "I'm not going to try to talk you out of it. But if you have 30 seconds, I'd really like to know what made you cancel. Was it the price? A missing feature? A bug or rough edge? The season wrapping up? Something else entirely?",
    "",
    "Just hit reply — it comes straight to me, and even one line helps me build something better for the next coach. If you'd rather not, no hard feelings.",
    "",
    "Thanks for giving XO Gridmaker a try.",
    "",
    "— Elijah",
    "Founder, XO Gridmaker",
    "admin@xogridmaker.com",
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildHtml(input: SendCancellationFeedbackInput): string {
  const first = escapeHtml(input.firstName?.trim() || "there");
  const endLabel = escapeHtml(formatPeriodEnd(input.periodEndDate));
  return `<!doctype html>
<html>
  <body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:560px; margin:0 auto; padding:24px; color:#111827; line-height:1.6; font-size:15px;">
    <p>Hi ${first},</p>
    <p>
      Confirming your XO Gridmaker subscription has been canceled. Your access stays active through
      <strong>${endLabel}</strong>; after that it won't renew and you won't be billed again. Your account,
      playbooks, plays, and roster all stay where they are — if you ever want to come back (next season,
      new team, whenever), everything's right where you left it.
    </p>
    <p>
      I'm not going to try to talk you out of it. But if you have 30 seconds, I'd really like to know what
      made you cancel. Was it the price? A missing feature? A bug or rough edge? The season wrapping up?
      Something else entirely?
    </p>
    <p>
      Just hit reply — it comes straight to me, and even one line helps me build something better for the
      next coach. If you'd rather not, no hard feelings.
    </p>
    <p>Thanks for giving XO Gridmaker a try.</p>
    <p style="margin-top:24px;">
      — Elijah<br/>
      Founder, XO Gridmaker<br/>
      <a href="mailto:admin@xogridmaker.com" style="color:#1769FF; text-decoration:none;">admin@xogridmaker.com</a>
    </p>
  </body>
</html>`;
}

/**
 * Send the cancellation feedback email via Resend. Returns the message id on
 * success or an error string on failure. Caller is responsible for the
 * idempotency guard (the webhook handler's UPDATE-with-guard claims the send
 * before invoking this so retries are safe).
 */
export async function sendCancellationFeedbackEmail(
  input: SendCancellationFeedbackInput,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  let cfg: Awaited<ReturnType<typeof getStoredResendConfig>>;
  try {
    cfg = await getStoredResendConfig();
  } catch (e) {
    return { ok: false, error: `Resend config unavailable: ${(e as Error).message}` };
  }
  if (!cfg.apiKey) return { ok: false, error: "Resend API key not configured" };
  if (!input.toEmail) return { ok: false, error: "Recipient email missing" };

  const resend = new Resend(cfg.apiKey);
  try {
    const res = await resend.emails.send({
      from: CANCELLATION_FROM_EMAIL,
      to: input.toEmail,
      // Even though "from" already routes replies to admin@, set Reply-To
      // explicitly so any client that surfaces it (some show Reply-To
      // distinctly) hands the founder a one-tap reply path.
      replyTo: "admin@xogridmaker.com",
      subject: buildSubject(),
      html: buildHtml(input),
      text: buildPlainText(input),
    });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, messageId: res.data?.id ?? "unknown" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Exported for unit tests. */
export const __INTERNALS_FOR_TEST = {
  buildSubject,
  buildPlainText,
  buildHtml,
  formatPeriodEnd,
};
