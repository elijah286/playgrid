import { Resend } from "resend";

import { getStoredResendConfig } from "@/lib/site/resend-config";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Best-effort: emails a league announcement to a set of recipients via the
 * platform Resend config. Returns how many sent. Sent from the platform address
 * with the league name in the subject/sign-off (no per-league domain yet).
 */
export async function sendLeagueBroadcast(opts: {
  recipients: string[];
  leagueName: string;
  title: string;
  body: string;
}): Promise<{ sent: number; error?: string }> {
  const recipients = [
    ...new Set(opts.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (recipients.length === 0) return { sent: 0 };

  const cfg = await getStoredResendConfig();
  if (!cfg.apiKey || !cfg.fromEmail) {
    return { sent: 0, error: "Email isn't configured yet (no Resend key / from address)." };
  }

  const subject = `[${opts.leagueName}] ${opts.title}`;
  const text = `${opts.body}\n\n— ${opts.leagueName}`;
  const bodyHtml = opts.body
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">` +
    `<h2 style="margin:0 0 12px">${escapeHtml(opts.title)}</h2>` +
    `${bodyHtml}` +
    `<p style="color:#666;margin-top:16px">— ${escapeHtml(opts.leagueName)}</p>` +
    `</div>`;

  const resend = new Resend(cfg.apiKey);
  let sent = 0;
  await Promise.all(
    recipients.map(async (to) => {
      try {
        await resend.emails.send({ from: cfg.fromEmail as string, to, subject, text, html });
        sent += 1;
      } catch {
        // best-effort per recipient
      }
    }),
  );
  return { sent };
}
