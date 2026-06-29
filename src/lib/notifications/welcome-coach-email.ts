import { Resend } from "resend";
import { getStoredResendConfig } from "@/lib/site/resend-config";

/**
 * One-shot transactional email sent when a coach purchases the Team Coach
 * plan. Three purposes:
 *   1. Thank them for the purchase.
 *   2. Frame XO Gridmaker as a new product we're actively building and excited
 *      about — set the expectation that their input shapes it.
 *   3. Open a direct feedback channel — replies route to admin@xogridmaker.com
 *      so the founder reads every question, concern, and idea directly.
 *
 * Sent at most once per subscription (the webhook UPDATEs the
 * `welcome_email_sent_at` column atomically before calling here, so Stripe
 * retries / duplicate events can't double-send).
 *
 * Not a campaign — no opt-in / unsubscribe link. It's the receipt-adjacent
 * email a new paying coach would expect, with a genuine feedback ask attached.
 */

/** From address overridden specifically for this template so replies route
 *  to a real founder-readable inbox regardless of what the global Resend
 *  "from" is configured as. */
export const WELCOME_FROM_EMAIL = "XO Gridmaker <admin@xogridmaker.com>";

export type SendWelcomeCoachInput = {
  toEmail: string;
  /** First name from profile display_name, or null → falls back to "there". */
  firstName: string | null;
};

export function buildSubject(): string {
  return "Welcome to Team Coach — and a quick thank-you";
}

export function buildPlainText(input: SendWelcomeCoachInput): string {
  const first = input.firstName?.trim() || "there";
  return [
    `Hi ${first},`,
    "",
    "Thank you for upgrading to Team Coach — it genuinely means a lot. XO Gridmaker is a new product and I'm pouring everything into it, so having you on board as a paying coach is a big deal to me.",
    "",
    "Here's the honest part: it's early, and I'm building this for coaches like you. So the one thing I'd ask in return for your trust is your input. If something's confusing, missing, broken, or just not how you'd expect it to work — I want to hear it. Questions, concerns, feature ideas, half-formed gripes: all of it helps me make XO Gridmaker better, faster.",
    "",
    "Just hit reply — it comes straight to me. No bots, no ticket queue. Even one line shapes what I build next.",
    "",
    "Thanks again for betting on a new product. Let's build you a better season.",
    "",
    "— Coach Eli",
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

export function buildHtml(input: SendWelcomeCoachInput): string {
  const first = escapeHtml(input.firstName?.trim() || "there");
  return `<!doctype html>
<html>
  <body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:560px; margin:0 auto; padding:24px; color:#111827; line-height:1.6; font-size:15px;">
    <p>Hi ${first},</p>
    <p>
      Thank you for upgrading to <strong>Team Coach</strong> — it genuinely means a lot.
      XO Gridmaker is a new product and I'm pouring everything into it, so having you on
      board as a paying coach is a big deal to me.
    </p>
    <p>
      Here's the honest part: it's early, and I'm building this for coaches like you. So the
      one thing I'd ask in return for your trust is your input. If something's confusing,
      missing, broken, or just not how you'd expect it to work — I want to hear it. Questions,
      concerns, feature ideas, half-formed gripes: all of it helps me make XO Gridmaker better,
      faster.
    </p>
    <p>
      Just hit reply — it comes straight to me. No bots, no ticket queue. Even one line shapes
      what I build next.
    </p>
    <p>Thanks again for betting on a new product. Let's build you a better season.</p>
    <p style="margin-top:24px;">
      — Coach Eli<br/>
      Founder, XO Gridmaker<br/>
      <a href="mailto:admin@xogridmaker.com" style="color:#1769FF; text-decoration:none;">admin@xogridmaker.com</a>
    </p>
  </body>
</html>`;
}

/**
 * Send the welcome email via Resend. Returns the message id on success or an
 * error string on failure. Caller is responsible for the idempotency guard
 * (the webhook handler's UPDATE-with-guard claims the send before invoking
 * this so retries are safe).
 */
export async function sendWelcomeCoachEmail(
  input: SendWelcomeCoachInput,
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
      from: WELCOME_FROM_EMAIL,
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
};
