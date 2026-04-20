"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getStoredResendConfig } from "@/lib/site/resend-config";

const DEFAULT_FROM_EMAIL = "PlayGrid <onboarding@resend.dev>";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PlaybookInvite = {
  id: string;
  playbook_id: string;
  role: "owner" | "editor" | "viewer";
  token: string;
  email: string | null;
  note: string | null;
  max_uses: number | null;
  uses_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type InvitePreview = {
  invite_id: string;
  playbook_id: string;
  playbook_name: string;
  team_name: string | null;
  season: string | null;
  logo_url: string | null;
  color: string | null;
  play_count: number;
  role: "owner" | "editor" | "viewer";
  expires_at: string;
  exhausted: boolean;
  revoked: boolean;
  expired: boolean;
};

const MAX_EXPIRY_DAYS = 30;

function generateToken(): string {
  return randomBytes(18).toString("base64url");
}

export async function createInviteAction(input: {
  playbookId: string;
  role: "viewer" | "editor";
  expiresInDays: number;
  maxUses: number | null;
  email?: string | null;
  note?: string | null;
}): Promise<{ ok: true; invite: PlaybookInvite } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const days = Math.max(1, Math.min(MAX_EXPIRY_DAYS, Math.floor(input.expiresInDays || 14)));
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("playbook_invites")
    .insert({
      playbook_id: input.playbookId,
      role: input.role,
      token: generateToken(),
      email: input.email?.trim() || null,
      note: input.note?.trim() || null,
      max_uses: input.maxUses,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${input.playbookId}`);
  return { ok: true, invite: data as PlaybookInvite };
}

export async function listInvitesAction(
  playbookId: string,
): Promise<{ ok: true; invites: PlaybookInvite[] } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playbook_invites")
    .select("*")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, invites: (data ?? []) as PlaybookInvite[] };
}

export async function revokeInviteAction(
  inviteId: string,
  playbookId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function previewInviteAction(
  token: string,
): Promise<{ ok: true; preview: InvitePreview } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_preview", { p_token: token });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "Invite not found." };
  return { ok: true, preview: row as InvitePreview };
}

export async function sendPlaybookInviteEmailAction(input: {
  playbookId: string;
  toEmail: string;
  inviteUrl: string;
  teamName: string;
  senderName?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const to = input.toEmail.trim();
  if (!EMAIL_RE.test(to)) return { ok: false, error: "Enter a valid email." };

  const cfg = await getStoredResendConfig().catch(() => ({
    apiKey: null as string | null,
    fromEmail: null as string | null,
  }));
  const apiKey = cfg.apiKey ?? process.env.RESEND_API_KEY ?? null;
  const fromEmail = cfg.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  if (!apiKey) {
    return { ok: false, error: "Email isn't configured. Copy the link instead, or set up Resend in Settings." };
  }

  const team = input.teamName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sender = (input.senderName ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const url = input.inviteUrl;
  const subject = `You're invited to ${input.teamName} on PlayGrid`;
  const text = [
    sender ? `${input.senderName} invited you to join ${input.teamName} on PlayGrid.` : `You've been invited to join ${input.teamName} on PlayGrid.`,
    "",
    `Open this link to join: ${url}`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="font-family:ui-sans-serif,system-ui,Segoe UI,Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">Join ${team} on PlayGrid</h1>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5">
        ${sender ? `${sender} invited you` : `You've been invited`} to view this team's playbook.
      </p>
      <p style="margin:0 0 20px">
        <a href="${url}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Open invite
        </a>
      </p>
      <p style="margin:0;color:#64748b;font-size:12px;word-break:break-all">Or paste this link: ${url}</p>
    </td></tr>
  </table>
</body></html>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from: fromEmail, to, subject, text, html });
    if (error) return { ok: false, error: error.message ?? "Failed to send email." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send email." };
  }

  return { ok: true };
}

export async function acceptInviteAction(
  token: string,
): Promise<{ ok: true; playbookId: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Invite is invalid, expired, or fully used." };
  return { ok: true, playbookId: data as string };
}
