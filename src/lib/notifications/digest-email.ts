import { Resend } from "resend";
import { getStoredResendConfig } from "@/lib/site/resend-config";

const DEFAULT_FROM_EMAIL = "xogridmaker <onboarding@resend.dev>";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export type DigestPlayUpdate = {
  playId: string;
  playName: string;
  actor: string;
  comment: string | null;
};

export type DigestJoin = {
  actor: string;
  role: "owner" | "editor" | "viewer";
};

/**
 * Sends one daily roll-up email to a single recipient summarizing the prior
 * window of activity in one playbook. Caller MUST guarantee the input has
 * at least one entry — empty digests are skipped at the cron layer so a
 * `digest_sends` row is never written for a no-op day.
 */
export async function sendDigestEmail(input: {
  toEmail: string;
  recipientName: string | null;
  playbookId: string;
  playbookName: string;
  joins: DigestJoin[];
  playUpdates: DigestPlayUpdate[];
}): Promise<boolean> {
  let cfg: Awaited<ReturnType<typeof getStoredResendConfig>>;
  try {
    cfg = await getStoredResendConfig();
  } catch {
    return false;
  }
  if (!cfg.apiKey) return false;
  const fromEmail = cfg.fromEmail ?? DEFAULT_FROM_EMAIL;

  const playbookUrl = `${SITE_URL}/playbooks/${input.playbookId}`;
  const settingsUrl = `${SITE_URL}/home?tab=activity&settings=1`;
  const totalCount = input.joins.length + input.playUpdates.length;
  const subject = `${input.playbookName}: ${totalCount} update${totalCount === 1 ? "" : "s"} since yesterday`;

  const lines: string[] = [];
  if (input.playUpdates.length > 0) {
    lines.push(
      `Plays updated (${input.playUpdates.length}):`,
      ...input.playUpdates.map(
        (u) =>
          `  • ${u.actor} updated ${u.playName}` +
          (u.comment ? ` — "${truncate(u.comment, 140)}"` : ""),
      ),
      "",
    );
  }
  if (input.joins.length > 0) {
    lines.push(
      `New teammates (${input.joins.length}):`,
      ...input.joins.map((j) => `  • ${j.actor} joined as ${j.role}`),
      "",
    );
  }
  lines.push(`Open the playbook:\n${playbookUrl}`);
  lines.push(
    "",
    `--`,
    `Adjust or turn off these emails in your playbook settings: ${settingsUrl}`,
  );

  const text = lines.join("\n");
  const htmlBody: string[] = [];
  if (input.playUpdates.length > 0) {
    htmlBody.push(
      `<h3 style="margin:16px 0 8px;font-size:14px;">Plays updated (${input.playUpdates.length})</h3>`,
      `<ul style="padding-left:20px;margin:0 0 12px;">` +
        input.playUpdates
          .map(
            (u) =>
              `<li style="margin:4px 0;"><strong>${escapeHtml(u.actor)}</strong> updated <strong>${escapeHtml(u.playName)}</strong>` +
              (u.comment
                ? `<br><span style="color:#555;font-style:italic;">"${escapeHtml(truncate(u.comment, 200))}"</span>`
                : "") +
              `</li>`,
          )
          .join("") +
        `</ul>`,
    );
  }
  if (input.joins.length > 0) {
    htmlBody.push(
      `<h3 style="margin:16px 0 8px;font-size:14px;">New teammates (${input.joins.length})</h3>`,
      `<ul style="padding-left:20px;margin:0 0 12px;">` +
        input.joins
          .map(
            (j) =>
              `<li style="margin:4px 0;"><strong>${escapeHtml(j.actor)}</strong> joined as ${escapeHtml(j.role)}</li>`,
          )
          .join("") +
        `</ul>`,
    );
  }
  htmlBody.push(
    `<p style="margin:18px 0 4px;"><a href="${playbookUrl}">Open ${escapeHtml(input.playbookName)}</a></p>`,
    `<hr style="border:none;border-top:1px solid #eee;margin:18px 0;">`,
    `<p style="font-size:11px;color:#888;margin:0;">Adjust or turn off these emails in your <a href="${settingsUrl}" style="color:#888;">playbook settings</a>.</p>`,
  );
  const html = htmlBody.join("");

  const resend = new Resend(cfg.apiKey);
  try {
    await resend.emails.send({
      from: fromEmail,
      to: input.toEmail,
      subject,
      text,
      html,
    });
    return true;
  } catch {
    return false;
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
