import { Resend } from "resend";
import { getStoredResendConfig } from "@/lib/site/resend-config";
import { buildUnsubscribeUrl } from "@/lib/email/unsubscribe-token";
import { withReengagementUtm, type PlayRecommendation } from "./reengagement-recs";

/** Category string written to `email_opt_outs.category`. */
export const REENGAGEMENT_OPT_OUT_CATEGORY = "reengagement";

const DEFAULT_FROM_EMAIL = "Coach Cal <onboarding@resend.dev>";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export type ReengagementKind = "3d" | "10d";

export type SendReengagementInput = {
  toEmail: string;
  /** Recipient user id — used to sign the one-click unsubscribe link
   *  (RFC 8058). Required: without it the email lacks the
   *  List-Unsubscribe headers Apple/Gmail need to keep us out of Junk. */
  userId: string;
  /** First name (or display name first word). Falls back to "Coach". */
  firstName: string | null;
  /** Friendly day-of-week string from when they started: "Sunday",
   *  "last Tuesday", etc. We compute this from `playCreatedAt`. */
  startedOnLabel: string;
  /** The play they already drew, so the message references it. */
  existingPlayName: string | null;
  /** Direct link to their playbook (deep-link to the editor). */
  playbookUrl: string;
  /** Three library-page recommendations, variant-scoped. */
  recommendations: PlayRecommendation[];
  /** 3d nudge has a softer subject; 10d is the final-call subject. */
  kind: ReengagementKind;
};

/** Compute a friendly "started on X" phrase from a created_at timestamp.
 *
 *  - 1 day ago  → "yesterday"
 *  - 2-6 days   → "Sunday" / "last Sunday" (day name from local)
 *  - 7-13 days  → "last week"
 *  - else       → "a couple of weeks back"
 *
 *  We don't try to be precise — the email reads as a coach-y nudge,
 *  not an audit log. */
export function startedOnLabel(playCreatedAt: Date, now = new Date()): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const ageDays = Math.floor((now.getTime() - playCreatedAt.getTime()) / dayMs);
  if (ageDays <= 1) return "yesterday";
  if (ageDays < 7) {
    const day = playCreatedAt.toLocaleDateString("en-US", { weekday: "long" });
    return day;
  }
  if (ageDays < 14) return "last week";
  return "a couple of weeks back";
}

function buildSubject(input: SendReengagementInput): string {
  const first = input.firstName?.trim() || "Coach";
  if (input.kind === "10d") {
    return `${first} — want to round out that playbook?`;
  }
  return `${first}, here are 3 plays similar coaches add next`;
}

function buildPlainText(input: SendReengagementInput, unsubscribeUrl: string): string {
  const first = input.firstName?.trim() || "Coach";
  const playRef = input.existingPlayName
    ? `your ${input.existingPlayName}`
    : "your first play";
  const leadIn =
    input.kind === "10d"
      ? `Hey ${first} — just checking back. You started a playbook ${input.startedOnLabel} with ${playRef}. Most coaches add 4-5 plays before they have something they'd actually run on Saturday. Here are three I'd add next:`
      : `Hey ${first} — saw you got ${playRef} into your playbook ${input.startedOnLabel}. Most coaches add a few more in the same sitting and then have a real call sheet. Three I'd pick next:`;
  const recs = input.recommendations
    .map((r, i) => {
      const tagged = withReengagementUtm(r.url, input.kind, recSlug(r.name));
      return `  ${i + 1}. ${r.name} — learn more: ${tagged}`;
    })
    .join("\n");
  const ctaUrl = withReengagementUtm(input.playbookUrl, input.kind, "cta");
  return [
    leadIn,
    "",
    recs,
    "",
    `Pick up where you left off: ${ctaUrl}`,
    "",
    "— XO Gridmaker",
    "",
    `Unsubscribe from these nudges: ${unsubscribeUrl}`,
  ].join("\n");
}

/** Slugify a play name into a stable utm_content value so analytics can
 *  attribute a click to the specific recommendation. Keep lowercase,
 *  hyphens, alphanumeric only — Google Analytics-style. */
function recSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(input: SendReengagementInput, unsubscribeUrl: string): string {
  const first = escapeHtml(input.firstName?.trim() || "Coach");
  const playRef = input.existingPlayName
    ? `your <strong>${escapeHtml(input.existingPlayName)}</strong>`
    : "your first play";
  const startedOn = escapeHtml(input.startedOnLabel);
  const leadIn =
    input.kind === "10d"
      ? `Hey ${first} — just checking back. You started a playbook <strong>${startedOn}</strong> with ${playRef}. Most coaches add 4–5 plays before they have something they'd run on Saturday.`
      : `Hey ${first} — saw you got ${playRef} into your playbook <strong>${startedOn}</strong>. Most coaches add a few more in the same sitting and then have a real call sheet.`;
  const recCards = input.recommendations
    .map((r) => {
      const tagged = withReengagementUtm(r.url, input.kind, recSlug(r.name));
      return `
    <tr>
      <td style="padding:10px 0; border-bottom:1px solid #e5e7eb;">
        <a href="${escapeHtml(tagged)}" style="color:#1769FF; text-decoration:none; font-weight:600; font-size:16px;">
          ${escapeHtml(r.name)}
        </a>
        <div style="margin-top:2px;">
          <a href="${escapeHtml(tagged)}" style="color:#6b7280; font-size:13px; text-decoration:underline;">
            Learn more about this play concept →
          </a>
        </div>
      </td>
    </tr>`;
    })
    .join("");
  const ctaUrl = withReengagementUtm(input.playbookUrl, input.kind, "cta");
  return `<!doctype html>
<html>
  <body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:560px; margin:0 auto; padding:24px; color:#111827; line-height:1.55;">
    <p style="font-size:15px;">${leadIn}</p>
    <p style="font-size:15px; margin-top:18px;"><strong>Three plays I'd add next:</strong></p>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%; margin-top:8px;">
      ${recCards}
    </table>
    <div style="margin-top:28px;">
      <a href="${escapeHtml(ctaUrl)}"
         style="display:inline-block; background:#1769FF; color:#ffffff; text-decoration:none; font-weight:700; padding:12px 22px; border-radius:10px; font-size:15px;">
        Pick up where you left off
      </a>
    </div>
    <p style="color:#6b7280; font-size:12px; margin-top:32px;">
      XO Gridmaker · You're getting this because you started a playbook
      with us. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280; text-decoration:underline;">Unsubscribe</a>
      from these nudges, or manage all notifications in your
      <a href="${SITE_URL}/account" style="color:#6b7280;">account settings</a>.
    </p>
  </body>
</html>`;
}

/**
 * Send one re-engagement nudge. Returns true on a successful Resend
 * call, false otherwise (config missing, send failed). Callers MUST
 * gate the idempotency-row insert on this return value so a Resend
 * failure doesn't burn the user's single 3d / 10d slot.
 */
export async function sendReengagementEmail(
  input: SendReengagementInput,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  let cfg: Awaited<ReturnType<typeof getStoredResendConfig>>;
  try {
    cfg = await getStoredResendConfig();
  } catch (e) {
    return { ok: false, error: `Resend config unavailable: ${(e as Error).message}` };
  }
  if (!cfg.apiKey) return { ok: false, error: "Resend API key not configured" };

  const resend = new Resend(cfg.apiKey);
  const fromEmail = cfg.fromEmail ?? DEFAULT_FROM_EMAIL;
  const unsubscribeUrl = buildUnsubscribeUrl({
    userId: input.userId,
    category: REENGAGEMENT_OPT_OUT_CATEGORY,
  });
  const subject = buildSubject(input);
  const text = buildPlainText(input, unsubscribeUrl);
  const html = buildHtml(input, unsubscribeUrl);

  // RFC 8058 one-click unsubscribe. Apple/Gmail downgrade to Junk if a
  // bulk-ish email is missing these — the single biggest deliverability
  // lever for a new sending domain. List-Unsubscribe lists both the
  // HTTPS endpoint (preferred) and a mailto fallback. List-Unsubscribe-Post
  // tells the mail client it can POST without user confirmation.
  const headers = {
    "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:unsubscribe@xogridmaker.com?subject=unsubscribe-${REENGAGEMENT_OPT_OUT_CATEGORY}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };

  try {
    const res = await resend.emails.send({
      from: fromEmail,
      to: input.toEmail,
      subject,
      html,
      text,
      headers,
    });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, messageId: res.data?.id ?? "unknown" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Exported for the test-send script + unit tests. */
export const __INTERNALS_FOR_TEST = { buildSubject, buildPlainText, buildHtml };
