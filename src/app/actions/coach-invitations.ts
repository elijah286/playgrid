"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getStoredResendConfig } from "@/lib/site/resend-config";

const DEFAULT_FROM_EMAIL = "PlayGrid <onboarding@resend.dev>";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function assertAdmin() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { ok: false as const, error: "Forbidden." };
  return { ok: true as const, userId: user.id };
}

export type CoachInvitationRow = {
  id: string;
  code: string;
  note: string | null;
  recipientEmail: string | null;
  expiresAt: string | null;
  createdAt: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
  redeemedByEmail: string | null;
  revokedAt: string | null;
  lastEmailedAt: string | null;
  status: "active" | "redeemed" | "revoked" | "expired";
};

function computeStatus(row: {
  redeemed_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}): CoachInvitationRow["status"] {
  if (row.redeemed_at) return "redeemed";
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
}

// Base32-ish alphabet without confusable chars (no 0/O/1/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `COACH-${out.slice(0, 5)}${out.slice(5, 10)}`;
}

export async function listCoachInvitationsAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error, items: [] };

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("coach_invitations")
    .select(
      "id, code, note, recipient_email, expires_at, created_at, redeemed_at, redeemed_by, revoked_at, last_emailed_at",
    )
    .order("created_at", { ascending: false });
  if (error) return { ok: false as const, error: error.message, items: [] };

  const redeemerIds = Array.from(
    new Set(
      (data ?? [])
        .map((r) => r.redeemed_by as string | null)
        .filter((v): v is string => !!v),
    ),
  );
  const emailsById = new Map<string, string>();
  if (redeemerIds.length > 0) {
    // auth.users isn't directly selectable; use the admin API.
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 });
    for (const u of usersData?.users ?? []) {
      if (redeemerIds.includes(u.id) && u.email) emailsById.set(u.id, u.email);
    }
  }

  const items: CoachInvitationRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    note: (r.note as string | null) ?? null,
    recipientEmail: (r.recipient_email as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    createdAt: r.created_at as string,
    redeemedAt: (r.redeemed_at as string | null) ?? null,
    redeemedBy: (r.redeemed_by as string | null) ?? null,
    redeemedByEmail: r.redeemed_by ? emailsById.get(r.redeemed_by as string) ?? null : null,
    revokedAt: (r.revoked_at as string | null) ?? null,
    lastEmailedAt: (r.last_emailed_at as string | null) ?? null,
    status: computeStatus(r as {
      redeemed_at: string | null;
      revoked_at: string | null;
      expires_at: string | null;
    }),
  }));

  return { ok: true as const, items };
}

export async function createCoachInvitationAction(input: {
  recipientEmail?: string;
  note?: string;
  expiresAt?: string | null;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const recipientEmail = input.recipientEmail?.trim() || null;
  const note = input.note?.trim() || null;
  const expiresAt = input.expiresAt?.trim() ? input.expiresAt : null;

  if (recipientEmail && !EMAIL_RE.test(recipientEmail)) {
    return { ok: false as const, error: "Invalid recipient email." };
  }
  if (note && note.length > 500) {
    return { ok: false as const, error: "Note must be 500 characters or fewer." };
  }
  if (expiresAt) {
    const t = new Date(expiresAt).getTime();
    if (Number.isNaN(t)) return { ok: false as const, error: "Invalid expiration date." };
    if (t <= Date.now()) {
      return { ok: false as const, error: "Expiration must be in the future." };
    }
  }

  const admin = createServiceRoleClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await admin
      .from("coach_invitations")
      .insert({
        code,
        note,
        recipient_email: recipientEmail,
        expires_at: expiresAt,
        created_by: gate.userId,
      })
      .select("id, code")
      .single();
    if (!error && data) {
      revalidatePath("/settings");
      return { ok: true as const, id: data.id as string, code: data.code as string };
    }
    // 23505 = unique_violation (collision on code). Retry.
    const code23505 = (error as { code?: string } | null)?.code;
    if (code23505 !== "23505") {
      return { ok: false as const, error: error?.message ?? "Failed to create invite." };
    }
  }
  return { ok: false as const, error: "Could not allocate a unique code. Try again." };
}

export async function revokeCoachInvitationAction(id: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("coach_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("redeemed_at", null);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function deleteCoachInvitationAction(id: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { error } = await admin.from("coach_invitations").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

function buildInviteEmailHtml(args: {
  code: string;
  signupUrl: string;
  note: string | null;
}): { text: string; html: string } {
  const safeCode = args.code.replace(/[^A-Z0-9-]/g, "");
  const noteBlock = args.note
    ? `<p style="margin:16px 0 0;color:#475569;font-size:14px">${args.note
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</p>`
    : "";
  const text = [
    "You've been invited to join PlayGrid as a coach.",
    "",
    `Your one-time invitation code: ${safeCode}`,
    "",
    `Sign up here: ${args.signupUrl}`,
    "",
    "The code is one-time use. Paste it in the \"Invite code\" field on the sign-up form,",
    "or use the link above which fills it in automatically.",
    args.note ? `\nNote: ${args.note}` : "",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family:ui-sans-serif,system-ui,Segoe UI,Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">You're invited to PlayGrid</h1>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.5">
        You've been invited to create a free <strong>coach</strong> account. Use the code below when signing up:
      </p>
      <div style="margin:20px 0;padding:16px 20px;background:#0f172a;color:#ffffff;border-radius:10px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;letter-spacing:2px;font-weight:700">
        ${safeCode}
      </div>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5">
        Or click the button to open a sign-up page with the code pre-filled:
      </p>
      <p style="margin:0">
        <a href="${args.signupUrl}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Sign up as a coach
        </a>
      </p>
      <p style="margin:16px 0 0;color:#64748b;font-size:12px">
        This code is one-time use. If you didn't expect this invitation, you can ignore this email.
      </p>
      ${noteBlock}
    </td></tr>
  </table>
</body></html>`;
  return { text, html };
}

export async function emailCoachInvitationAction(input: {
  id: string;
  overrideRecipient?: string;
  origin?: string;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { data: row, error: rowErr } = await admin
    .from("coach_invitations")
    .select("id, code, note, recipient_email, expires_at, redeemed_at, revoked_at")
    .eq("id", input.id)
    .single();
  if (rowErr || !row) return { ok: false as const, error: rowErr?.message ?? "Invite not found." };

  if (row.redeemed_at) {
    return { ok: false as const, error: "This invite has already been redeemed." };
  }
  if (row.revoked_at) {
    return { ok: false as const, error: "This invite has been revoked." };
  }

  const recipient = (input.overrideRecipient ?? row.recipient_email ?? "").trim();
  if (!recipient) {
    return { ok: false as const, error: "No recipient email. Add one on the invite or pass one here." };
  }
  if (!EMAIL_RE.test(recipient)) {
    return { ok: false as const, error: "Invalid recipient email." };
  }

  const cfg = await getStoredResendConfig().catch(() => ({
    apiKey: null as string | null,
    fromEmail: null as string | null,
    contactToEmail: null as string | null,
  }));
  const apiKey = cfg.apiKey ?? process.env.RESEND_API_KEY ?? null;
  const fromEmail = cfg.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  if (!apiKey) {
    return {
      ok: false as const,
      error: "Resend is not configured. Add an API key in Settings → Integrations first.",
    };
  }

  const origin = (input.origin ?? "").trim().replace(/\/$/, "");
  const signupUrl = origin
    ? `${origin}/login?invite=${encodeURIComponent(row.code as string)}`
    : `/login?invite=${encodeURIComponent(row.code as string)}`;

  const { text, html } = buildInviteEmailHtml({
    code: row.code as string,
    signupUrl,
    note: (row.note as string | null) ?? null,
  });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: recipient,
      subject: "Your PlayGrid coach invitation",
      text,
      html,
    });
    if (error) return { ok: false as const, error: error.message ?? "Failed to send email." };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Failed to send email.",
    };
  }

  await admin
    .from("coach_invitations")
    .update({ last_emailed_at: new Date().toISOString(), recipient_email: recipient })
    .eq("id", row.id as string);

  revalidatePath("/settings");
  return { ok: true as const };
}

/** Public: called from the signup form after supabase.auth.signUp resolves so the
 *  dashboard layout's cached role gets refreshed. Redemption itself happens in
 *  the DB trigger; this just reports the outcome. */
export async function afterSignupSyncRoleAction() {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  revalidateTag(`user-role:${user.id}`, "max");

  return { ok: true as const, role: (profile?.role as string | null) ?? "user" };
}
