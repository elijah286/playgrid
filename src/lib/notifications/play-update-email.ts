import { Resend } from "resend";
import { getStoredResendConfig } from "@/lib/site/resend-config";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const DEFAULT_FROM_EMAIL = "xogridmaker <onboarding@resend.dev>";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

/**
 * Best-effort fan-out email for an explicit "Notify team" broadcast on a
 * play. Goes to every active member of the playbook except the sender.
 * Failures are swallowed — the in-app activity feed is the source of
 * truth.
 */
export async function sendPlayUpdateNotification(input: {
  playbookId: string;
  playId: string;
  playName: string;
  playbookName: string;
  senderUserId: string;
  senderName: string | null;
  comment: string | null;
}): Promise<void> {
  let cfg: Awaited<ReturnType<typeof getStoredResendConfig>>;
  try {
    cfg = await getStoredResendConfig();
  } catch {
    return;
  }
  if (!cfg.apiKey) return;
  const fromEmail = cfg.fromEmail ?? DEFAULT_FROM_EMAIL;

  const admin = createServiceRoleClient();

  const { data: members } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", input.playbookId)
    .eq("status", "active");
  const recipientIds = (members ?? [])
    .map((m) => m.user_id as string | null)
    .filter((id): id is string => Boolean(id) && id !== input.senderUserId);
  if (recipientIds.length === 0) return;

  const recipients: string[] = [];
  for (const uid of recipientIds) {
    const { data: u } = await admin.auth.admin.getUserById(uid);
    const email = u?.user?.email;
    if (email) recipients.push(email);
  }
  if (recipients.length === 0) return;

  const sender = input.senderName?.trim() || "Your coach";
  const playUrl = `${SITE_URL}/playbooks/${input.playbookId}/plays/${input.playId}`;
  const comment = input.comment?.trim() || null;
  const subject = `${sender} updated ${input.playName} on ${input.playbookName}`;
  const text =
    `${sender} broadcast an update to ${input.playName} on ${input.playbookName}.\n\n` +
    (comment ? `Note from ${sender}:\n${comment}\n\n` : "") +
    `Open the play:\n${playUrl}\n`;
  const html =
    `<p><strong>${escapeHtml(sender)}</strong> updated ` +
    `<strong>${escapeHtml(input.playName)}</strong> on ` +
    `<strong>${escapeHtml(input.playbookName)}</strong>.</p>` +
    (comment
      ? `<blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#444;">${escapeHtml(comment).replace(/\n/g, "<br>")}</blockquote>`
      : "") +
    `<p><a href="${playUrl}">Open the play</a></p>`;

  const resend = new Resend(cfg.apiKey);
  await Promise.all(
    recipients.map(async (to) => {
      try {
        await resend.emails.send({ from: fromEmail, to, subject, text, html });
      } catch {
        // best-effort
      }
    }),
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
