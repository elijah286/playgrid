import { Resend } from "resend";
import { getStoredResendConfig } from "@/lib/site/resend-config";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const DEFAULT_FROM_EMAIL = "xogridmaker <onboarding@resend.dev>";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

/**
 * Best-effort email to every owner of a playbook letting them know a
 * player has asked to claim a roster spot. Failures are swallowed —
 * the in-app inbox is the source of truth.
 */
export async function sendRosterClaimNotification(input: {
  playbookId: string;
  claimingUserId: string;
  rosterLabel: string | null;
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

  const { data: pb } = await admin
    .from("playbooks")
    .select("name")
    .eq("id", input.playbookId)
    .maybeSingle();
  const playbookName = (pb?.name as string | undefined) ?? "your playbook";

  const { data: owners } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", input.playbookId)
    .eq("role", "owner")
    .eq("status", "active");
  const ownerIds = (owners ?? [])
    .map((m) => m.user_id as string | null)
    .filter((id): id is string => Boolean(id) && id !== input.claimingUserId);
  if (ownerIds.length === 0) return;

  const { data: claimingProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", input.claimingUserId)
    .maybeSingle();
  const claimerName =
    (claimingProfile?.display_name as string | null) ?? "A player";
  const slot = input.rosterLabel?.trim() || "an unclaimed roster spot";

  const inboxUrl = `${SITE_URL}/home?tab=inbox`;
  const playbookUrl = `${SITE_URL}/playbooks/${input.playbookId}?tab=roster`;
  const subject = `${claimerName} wants to join ${playbookName}`;
  const text =
    `${claimerName} asked to claim "${slot}" on ${playbookName}.\n\n` +
    `Approve or reject:\n${inboxUrl}\n\n` +
    `Or open the roster:\n${playbookUrl}\n`;
  const html =
    `<p><strong>${escapeHtml(claimerName)}</strong> asked to claim ` +
    `<strong>${escapeHtml(slot)}</strong> on ` +
    `<strong>${escapeHtml(playbookName)}</strong>.</p>` +
    `<p><a href="${inboxUrl}">Open your inbox</a> to approve or reject, ` +
    `or <a href="${playbookUrl}">go straight to the roster</a>.</p>`;

  const recipients: string[] = [];
  for (const uid of ownerIds) {
    const { data: u } = await admin.auth.admin.getUserById(uid);
    const email = u?.user?.email;
    if (email) recipients.push(email);
  }
  if (recipients.length === 0) return;

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
