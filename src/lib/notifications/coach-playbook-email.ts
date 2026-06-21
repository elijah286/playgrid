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
 * Best-effort: email a head coach a copy link to their team's seeded playbook.
 * Sent from the platform Resend config (same rail as other notification emails).
 */
export async function sendCoachPlaybookInvite(opts: {
  to: string;
  leagueName: string;
  teamName: string;
  claimUrl: string;
}): Promise<{ sent: boolean; error?: string }> {
  const to = opts.to.trim();
  if (!to) return { sent: false, error: "No coach email." };

  const cfg = await getStoredResendConfig();
  if (!cfg.apiKey || !cfg.fromEmail) {
    return { sent: false, error: "Email isn't configured yet (no Resend key / from address)." };
  }

  const subject = `${opts.teamName} playbook from ${opts.leagueName}`;
  const text =
    `${opts.leagueName} set up a playbook for ${opts.teamName}.\n\n` +
    `Claim your copy to start coaching in XO Gridmaker:\n${opts.claimUrl}\n`;
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">` +
    `<p><strong>${escapeHtml(opts.leagueName)}</strong> set up a playbook for ` +
    `<strong>${escapeHtml(opts.teamName)}</strong>.</p>` +
    `<p><a href="${opts.claimUrl}">Claim your copy</a> to start coaching in XO Gridmaker — ` +
    `it's yours to edit.</p>` +
    `<p style="color:#666;font-size:13px">${escapeHtml(opts.claimUrl)}</p>` +
    `</div>`;

  try {
    const resend = new Resend(cfg.apiKey);
    await resend.emails.send({ from: cfg.fromEmail, to, subject, text, html });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Could not send the email." };
  }
}
