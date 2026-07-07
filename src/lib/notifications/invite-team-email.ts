import { Resend } from "resend";
import { getStoredResendConfig } from "@/lib/site/resend-config";
import { buildUnsubscribeUrl } from "@/lib/email/unsubscribe-token";

const DEFAULT_FROM_EMAIL = "XO Gridmaker <no-reply@xogridmaker.com>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

/** Opt-out category for the team-invite nudge (checked in email_opt_outs). */
export const INVITE_TEAM_OPT_OUT_CATEGORY = "invite_team";

export type SendInviteTeamInput = {
  toEmail: string;
  userId: string;
  firstName: string | null;
  /** Playbook the coach can share (deep link to its page). */
  playbookUrl: string;
  playbookName: string | null;
  playCount: number;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSubject(input: SendInviteTeamInput): string {
  return input.playbookName
    ? `Get your team into ${input.playbookName}`
    : "Get your team ready for the season";
}

function buildText(input: SendInviteTeamInput, unsubscribeUrl: string): string {
  const name = input.firstName?.trim() || "Coach";
  const scheduleUrl = `${SITE_URL}/home?tab=calendar`;
  return [
    `Hi ${name},`,
    ``,
    `You've built ${input.playCount} plays${input.playbookName ? ` in ${input.playbookName}` : ""} — nice work.`,
    ``,
    `The coaches who get the most out of XO Gridmaker do one more thing: they bring their team in. When your players, parents, and assistant coaches are on the app:`,
    `  • Everyone sees the playbook and wristband — no more printing 15 copies`,
    `  • You post the practice/game schedule once; they RSVP`,
    `  • Team chat keeps everyone on the same page`,
    ``,
    `It takes about 30 seconds. Fall season's around the corner — get set up now:`,
    ``,
    `Invite your team: ${input.playbookUrl}`,
    `Schedule your first practice: ${scheduleUrl}`,
    ``,
    `— The XO Gridmaker team`,
    ``,
    `Unsubscribe from these nudges: ${unsubscribeUrl}`,
  ].join("\n");
}

function buildHtml(input: SendInviteTeamInput, unsubscribeUrl: string): string {
  const name = esc(input.firstName?.trim() || "Coach");
  const book = input.playbookName ? esc(input.playbookName) : null;
  const scheduleUrl = `${SITE_URL}/home?tab=calendar`;
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e2e8f0;">
      <p style="font-size:16px;color:#0f172a;margin:0 0 12px;">Hi ${name},</p>
      <p style="font-size:15px;line-height:1.5;color:#334155;margin:0 0 16px;">
        You've built <strong>${input.playCount} plays</strong>${book ? ` in <strong>${book}</strong>` : ""} — nice work.
      </p>
      <p style="font-size:15px;line-height:1.5;color:#334155;margin:0 0 12px;">
        The coaches who get the most out of XO Gridmaker do one more thing: <strong>they bring their team in.</strong> When your players, parents, and assistant coaches are on the app:
      </p>
      <ul style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 20px;padding-left:20px;">
        <li>Everyone sees the playbook and wristband — no more printing 15 copies</li>
        <li>You post the practice &amp; game schedule once; they RSVP</li>
        <li>Team chat keeps everyone on the same page</li>
      </ul>
      <div style="text-align:center;margin:24px 0 12px;">
        <a href="${esc(input.playbookUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:12px;">Invite your team →</a>
      </div>
      <p style="text-align:center;font-size:13px;margin:0 0 20px;">
        <a href="${scheduleUrl}" style="color:#2563eb;text-decoration:none;">or schedule your first practice</a>
      </p>
      <p style="font-size:14px;line-height:1.5;color:#64748b;margin:0;">
        Fall season's around the corner — get set up now. It takes about 30 seconds.
      </p>
      <p style="font-size:14px;color:#334155;margin:16px 0 0;">— The XO Gridmaker team</p>
    </div>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin:16px 0 0;">
      <a href="${unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe from these nudges</a>
    </p>
  </div></body></html>`;
}

export async function sendInviteTeamEmail(
  input: SendInviteTeamInput,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const cfg = await getStoredResendConfig();
  if (!cfg.apiKey) return { ok: false, error: "Resend API key not configured" };
  const fromEmail = cfg.fromEmail ?? DEFAULT_FROM_EMAIL;
  const unsubscribeUrl = buildUnsubscribeUrl({
    userId: input.userId,
    category: INVITE_TEAM_OPT_OUT_CATEGORY,
  });
  const headers = {
    "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:unsubscribe@xogridmaker.com?subject=unsubscribe-${INVITE_TEAM_OPT_OUT_CATEGORY}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  try {
    const resend = new Resend(cfg.apiKey);
    const res = await resend.emails.send({
      from: fromEmail,
      to: input.toEmail,
      subject: buildSubject(input),
      html: buildHtml(input, unsubscribeUrl),
      text: buildText(input, unsubscribeUrl),
      headers,
    });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, messageId: res.data?.id ?? "unknown" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
