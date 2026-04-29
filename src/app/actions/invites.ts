"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getStoredResendConfig } from "@/lib/site/resend-config";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import { tierAtLeast } from "@/lib/billing/features";
import { ensureSeatsAvailable } from "@/lib/billing/seats";
import { sanitizeSharedPrefs, type PlaybookViewPrefs } from "@/domain/playbook/view-prefs";

const DEFAULT_FROM_EMAIL = "xogridmaker <onboarding@resend.dev>";
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
  auto_approve: boolean;
  auto_approve_limit: number | null;
};

export type InvitePreview = {
  invite_id: string;
  playbook_id: string;
  playbook_name: string;
  team_name: string | null;
  season: string | null;
  sport_variant: string | null;
  logo_url: string | null;
  color: string | null;
  play_count: number;
  head_coach_name: string | null;
  role: "owner" | "editor" | "viewer";
  expires_at: string;
  exhausted: boolean;
  revoked: boolean;
  expired: boolean;
  // True when accepting this invite grants active access immediately,
  // bypassing the owner-approval queue. Sourced from playbook_invites
  // since the invite_preview RPC predates this flag.
  auto_approve: boolean;
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
  autoApprove?: boolean;
  autoApproveLimit?: number | null;
}): Promise<{ ok: true; invite: PlaybookInvite } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Authorize: caller must be an active owner or editor of this playbook.
  // Non-owner editors can issue player invites against the owner's seat
  // allowance regardless of their own tier — the owner is the one paying.
  const admin = createServiceRoleClient();
  const { data: callerMem } = await admin
    .from("playbook_members")
    .select("role, status")
    .eq("playbook_id", input.playbookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!callerMem || callerMem.status !== "active" || !["owner", "editor"].includes(callerMem.role as string)) {
    return { ok: false, error: "You don't have permission to share this playbook." };
  }
  const isOwner = callerMem.role === "owner";

  // Owner must be Coach+ to share at all (seat-bound features). Non-owner
  // editors ride on the owner's tier — the owner already paid.
  if (isOwner) {
    const entitlement = await getUserEntitlement(user.id);
    if (!tierAtLeast(entitlement, "coach")) {
      return {
        ok: false,
        error: "Sharing a playbook is a Team Coach feature. Upgrade to unlock.",
      };
    }
  }

  // Coach invites are owner-only and seat-bound at creation, but the
  // link itself is reusable — the seat check inside accept_invite gates
  // each redemption so an over-shared link can't exceed the owner's cap.
  // Player invites are unlimited and editors may issue them too.
  const effectiveMaxUses = input.maxUses;
  const effectiveAutoApproveLimit = input.autoApproveLimit ?? null;
  if (input.role === "editor") {
    if (!isOwner) {
      return {
        ok: false,
        error: "Only the playbook owner can grant coach (edit) access.",
      };
    }
    const seatCheck = await ensureSeatsAvailable(user.id, 1);
    if (!seatCheck.ok) return { ok: false, error: seatCheck.error };
  }

  const days = Math.max(1, Math.min(MAX_EXPIRY_DAYS, Math.floor(input.expiresInDays || 14)));
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  // Snapshot the sharer's current view prefs so the invitee inherits the
  // same starting view on first visit. Best-effort — if there are no prefs
  // yet, we store null and the invitee just sees defaults.
  const { data: myPrefs } = await supabase
    .from("playbook_view_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .eq("playbook_id", input.playbookId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("playbook_invites")
    .insert({
      playbook_id: input.playbookId,
      role: input.role,
      token: generateToken(),
      email: input.email?.trim() || null,
      note: input.note?.trim() || null,
      max_uses: effectiveMaxUses,
      expires_at: expiresAt,
      created_by: user.id,
      filters_snapshot: sanitizeSharedPrefs(myPrefs?.preferences as PlaybookViewPrefs | null),
      auto_approve: input.autoApprove ?? true,
      auto_approve_limit: effectiveAutoApproveLimit,
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
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };
  return { ok: true, invites: (data ?? []) as PlaybookInvite[] };
}

/**
 * Re-send a previously-created coach invite email. Used by the seats
 * card on /account so an owner can poke a coach who hasn't accepted yet.
 * Authorizes by checking the caller is the playbook owner.
 */
export async function resendCoachInviteAction(
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createServiceRoleClient();
  const { data: inv } = await admin
    .from("playbook_invites")
    .select("id, playbook_id, role, email, token, expires_at, revoked_at, max_uses, uses_count")
    .eq("id", inviteId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invite not found." };
  if (!inv.email) return { ok: false, error: "This invite has no email on file. Copy the link from the playbook instead." };

  const { data: ownerRow } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", inv.playbook_id as string)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  if ((ownerRow?.user_id as string | null) !== user.id) {
    return { ok: false, error: "You can only resend invites for your own playbooks." };
  }

  const { data: pb } = await admin
    .from("playbooks")
    .select("name")
    .eq("id", inv.playbook_id as string)
    .maybeSingle();
  const teamName = ((pb?.name as string | null) ?? "your team").trim() || "your team";

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const senderName = (profile?.display_name as string | null) ?? null;

  const { SITE_URL } = await getSiteUrl();
  const inviteUrl = `${SITE_URL}/invite/${inv.token as string}`;
  return sendPlaybookInviteEmailAction({
    playbookId: inv.playbook_id as string,
    toEmail: inv.email as string,
    inviteUrl,
    teamName,
    senderName,
  });
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

export async function revokeAllInvitesAction(
  playbookId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("playbook_invites")
    .update({ revoked_at: now })
    .eq("playbook_id", playbookId)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("id");
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true, count: data?.length ?? 0 };
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
  // The invite_preview RPC pre-dates the auto_approve column, so look it up
  // separately. Service role bypasses RLS, which is what we want here — the
  // token already gates access.
  const admin = createServiceRoleClient();
  const { data: flagRow } = await admin
    .from("playbook_invites")
    .select("auto_approve")
    .eq("token", token)
    .maybeSingle();
  const autoApprove = flagRow?.auto_approve ?? false;
  return { ok: true, preview: { ...(row as Omit<InvitePreview, "auto_approve">), auto_approve: autoApprove } };
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
    contactToEmail: null as string | null,
  }));
  const apiKey = cfg.apiKey ?? process.env.RESEND_API_KEY ?? null;
  const fromEmail = cfg.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  if (!apiKey) {
    return { ok: false, error: "Email isn't configured. Copy the link instead, or set up Resend in Settings." };
  }

  const team = input.teamName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sender = (input.senderName ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const url = input.inviteUrl;
  const subject = `You're invited to ${input.teamName} on xogridmaker`;
  const text = [
    sender ? `${input.senderName} invited you to join ${input.teamName} on xogridmaker.` : `You've been invited to join ${input.teamName} on xogridmaker.`,
    "",
    `Open this link to join: ${url}`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="font-family:ui-sans-serif,system-ui,Segoe UI,Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">Join ${team} on xogridmaker</h1>
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

export type ShareResultRow =
  | { email: string; kind: "added"; userId: string }
  | { email: string; kind: "already_member" }
  | { email: string; kind: "invited"; inviteUrl: string }
  | { email: string; kind: "failed"; error: string };

/**
 * Share a playbook with a list of emails in one call.
 *
 * For each email:
 * - If the address already has a xogridmaker account, upsert an active
 *   `playbook_members` row so the playbook appears on their dashboard
 *   immediately, then email them a heads-up link.
 * - Otherwise fall back to the invite-link flow: create a scoped invite
 *   and send the existing invite email.
 */
export async function sharePlaybookWithEmailsAction(input: {
  playbookId: string;
  role: "viewer" | "editor";
  emails: string[];
  teamName: string;
  senderName?: string | null;
}): Promise<
  | { ok: true; results: ShareResultRow[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Authorize: caller must be an owner/editor of this playbook. RLS on
  // playbook_members enforces this for the select below.
  const { data: callerMem, error: callerErr } = await supabase
    .from("playbook_members")
    .select("role, status")
    .eq("playbook_id", input.playbookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (callerErr) return { ok: false, error: callerErr.message };
  if (!callerMem || callerMem.status !== "active" || !["owner", "editor"].includes(callerMem.role)) {
    return { ok: false, error: "You don't have permission to share this playbook." };
  }
  // Editors can invite players, but only the owner can grant coach
  // (edit) access — otherwise a coach could quietly burn the owner's
  // seats and grow the edit-access circle without consent.
  if (input.role === "editor" && callerMem.role !== "owner") {
    return {
      ok: false,
      error: "Only the playbook owner can grant coach (edit) access.",
    };
  }

  const cleaned = Array.from(
    new Set(
      input.emails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => EMAIL_RE.test(e)),
    ),
  );
  if (cleaned.length === 0) return { ok: false, error: "Enter at least one valid email." };

  const admin = createServiceRoleClient();
  const { SITE_URL } = await getSiteUrl();
  const results: ShareResultRow[] = [];

  // Resolve the playbook owner. Seat math is scoped to the owner, not the
  // caller — an editor-tier collaborator inviting more people still bills
  // against the head coach's seat allowance.
  const { data: ownerRow } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", input.playbookId)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  const ownerId = (ownerRow?.user_id as string | null) ?? null;

  for (const email of cleaned) {
    try {
      const { data: uidData, error: uidErr } = await admin.rpc("email_to_user_id", {
        p_email: email,
      });
      if (uidErr) {
        results.push({ email, kind: "failed", error: uidErr.message });
        continue;
      }
      const userId = (uidData as string | null) ?? null;

      if (userId) {
        // Already a member? Treat as success (surface clearly).
        const { data: existing } = await admin
          .from("playbook_members")
          .select("role, status")
          .eq("playbook_id", input.playbookId)
          .eq("user_id", userId)
          .maybeSingle();
        const alreadyActive = !!existing && existing.status === "active";
        if (!alreadyActive) {
          // Seat guard: only coach (editor) memberships consume seats.
          // Player (viewer) invites are unlimited. Coach+ paying invitees
          // ride free even when added as editors.
          if (ownerId && input.role === "editor") {
            const inviteeEntitlement = await getUserEntitlement(userId);
            const isPaidInvitee = tierAtLeast(inviteeEntitlement, "coach");
            if (!isPaidInvitee) {
              const seatCheck = await ensureSeatsAvailable(ownerId, 1);
              if (!seatCheck.ok) {
                results.push({ email, kind: "failed", error: seatCheck.error });
                continue;
              }
            }
          }
          // Direct add / upgrade an existing pending row. The
          // (playbook_id, user_id) unique index is partial (only where
          // user_id is not null), so PostgREST's ON CONFLICT can't bind
          // to it — do it manually via select-then-insert-or-update.
          const upErr = existing
            ? (
                await admin
                  .from("playbook_members")
                  .update({ role: input.role, status: "active" })
                  .eq("playbook_id", input.playbookId)
                  .eq("user_id", userId)
              ).error
            : (
                await admin.from("playbook_members").insert({
                  playbook_id: input.playbookId,
                  user_id: userId,
                  role: input.role,
                  status: "active",
                })
              ).error;
          if (upErr) {
            results.push({ email, kind: "failed", error: upErr.message });
            continue;
          }
          // Seed recipient's view prefs from the sharer's current prefs,
          // first-visit-only (insert-or-nothing). Best-effort; silently
          // skip on error so it never blocks the share.
          const { data: myPrefs } = await supabase
            .from("playbook_view_preferences")
            .select("preferences")
            .eq("user_id", user.id)
            .eq("playbook_id", input.playbookId)
            .maybeSingle();
          await admin
            .from("playbook_view_preferences")
            .insert({
              user_id: userId,
              playbook_id: input.playbookId,
              preferences: myPrefs?.preferences ?? {},
            })
            .then(() => undefined, () => undefined);
        }
        // Always send a "was shared with you" email, even on re-share, so
        // the recipient sees the signal. Surface email send errors instead
        // of swallowing them silently.
        const playbookUrl = `${SITE_URL}/playbooks/${input.playbookId}`;
        try {
          await sendSharedExistingUserEmail({
            to: email,
            playbookUrl,
            teamName: input.teamName,
            senderName: input.senderName ?? null,
            role: input.role,
          });
        } catch (e) {
          console.error("[sharePlaybookWithEmailsAction] send failed", {
            email,
            playbookId: input.playbookId,
            error: e instanceof Error ? e.message : e,
          });
          results.push({
            email,
            kind: "failed",
            error:
              "Added to the playbook, but the notification email could not be sent: " +
              (e instanceof Error ? e.message : "unknown error"),
          });
          continue;
        }
        results.push({
          email,
          kind: alreadyActive ? "already_member" : "added",
          userId,
        });
      } else {
        // No existing account — they'll sign up as free. Only reserve a
        // seat for coach (editor) invites; player invites are unlimited.
        if (ownerId && input.role === "editor") {
          const seatCheck = await ensureSeatsAvailable(ownerId, 1);
          if (!seatCheck.ok) {
            results.push({ email, kind: "failed", error: seatCheck.error });
            continue;
          }
        }
        // Create a scoped invite for this email and send the invite email.
        const inv = await createInviteAction({
          playbookId: input.playbookId,
          role: input.role,
          expiresInDays: 14,
          maxUses: 1,
          email,
          note: null,
          autoApprove: true,
          autoApproveLimit: null,
        });
        if (!inv.ok) {
          results.push({ email, kind: "failed", error: inv.error });
          continue;
        }
        const inviteUrl = `${SITE_URL}/invite/${inv.invite.token}`;
        const sendRes = await sendPlaybookInviteEmailAction({
          playbookId: input.playbookId,
          toEmail: email,
          inviteUrl,
          teamName: input.teamName,
          senderName: input.senderName ?? null,
        });
        if (!sendRes.ok) {
          // Invite row still exists; user can copy link from the history tab.
          results.push({ email, kind: "failed", error: sendRes.error });
          continue;
        }
        results.push({ email, kind: "invited", inviteUrl });
      }
    } catch (e) {
      results.push({
        email,
        kind: "failed",
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  revalidatePath(`/playbooks/${input.playbookId}`);
  return { ok: true, results };
}

async function getSiteUrl(): Promise<{ SITE_URL: string }> {
  return { SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com" };
}

async function sendSharedExistingUserEmail(input: {
  to: string;
  playbookUrl: string;
  teamName: string;
  senderName: string | null;
  role: "viewer" | "editor";
}): Promise<void> {
  const cfg = await getStoredResendConfig().catch(() => ({
    apiKey: null as string | null,
    fromEmail: null as string | null,
    contactToEmail: null as string | null,
  }));
  const apiKey = cfg.apiKey ?? process.env.RESEND_API_KEY ?? null;
  const fromEmail = cfg.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  if (!apiKey) {
    throw new Error("Resend API key not configured — set it in Site Admin or RESEND_API_KEY.");
  }

  const team = input.teamName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sender = (input.senderName ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const roleLabel = input.role === "editor" ? "as a coach" : "as a player";
  const subject = `${input.teamName} was shared with you on xogridmaker`;
  const text = [
    sender
      ? `${input.senderName} shared ${input.teamName} with you on xogridmaker ${roleLabel}.`
      : `${input.teamName} was shared with you on xogridmaker ${roleLabel}.`,
    "",
    `Open the playbook: ${input.playbookUrl}`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="font-family:ui-sans-serif,system-ui,Segoe UI,Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">${team} was shared with you</h1>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5">
        ${sender ? `${sender} added you` : `You were added`} to ${team} on xogridmaker ${roleLabel}. It&rsquo;s already on your dashboard — open it below.
      </p>
      <p style="margin:0 0 20px">
        <a href="${input.playbookUrl}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Open playbook
        </a>
      </p>
      <p style="margin:0;color:#64748b;font-size:12px;word-break:break-all">Or paste this link: ${input.playbookUrl}</p>
    </td></tr>
  </table>
</body></html>`;

  const resend = new Resend(apiKey);
  const res = await resend.emails.send({
    from: fromEmail,
    to: input.to,
    subject,
    text,
    html,
  });
  const err = res.error as { message?: string } | string | null | undefined;
  if (err) {
    throw new Error(
      typeof err === "string" ? err : err.message || JSON.stringify(err),
    );
  }
}

export async function requestCoachAccessAction(
  token: string,
): Promise<
  | { ok: true; playbookId: string; status: "active" | "pending" }
  | { ok: false; error: string }
> {
  const accepted = await acceptInviteAction(token);
  if (!accepted.ok) return accepted;

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_coach_upgrade", {
    p_playbook_id: accepted.playbookId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/playbooks/${accepted.playbookId}`);
  return { ok: true, playbookId: accepted.playbookId, status: accepted.status };
}

export async function acceptInviteAction(
  token: string,
): Promise<
  | { ok: true; playbookId: string; status: "active" | "pending" }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Pull the invite's filters snapshot before accepting, so we can seed
  // the accepter's view prefs on first visit. Looked up by token so it
  // works even before the accept RPC completes.
  const { data: inviteRow } = await supabase
    .from("playbook_invites")
    .select("playbook_id, filters_snapshot, role")
    .eq("token", token)
    .maybeSingle();

  // Per-redemption seat check for editor (coach) invites. Coach links are
  // reusable, so the create-time check isn't enough on its own — without
  // this, an over-shared link could grant more coach seats than the owner
  // has paid for. Skip when the user is already an editor on this playbook
  // (re-accepting their own link doesn't consume a new seat).
  if (inviteRow?.role === "editor") {
    const admin = createServiceRoleClient();
    const { data: ownerRow } = await admin
      .from("playbook_members")
      .select("user_id")
      .eq("playbook_id", inviteRow.playbook_id as string)
      .eq("role", "owner")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const ownerId = (ownerRow?.user_id as string | null) ?? null;
    const { data: existingMember } = await admin
      .from("playbook_members")
      .select("role")
      .eq("playbook_id", inviteRow.playbook_id as string)
      .eq("user_id", user.id)
      .maybeSingle();
    const alreadyCoach = existingMember?.role === "editor" || existingMember?.role === "owner";
    if (ownerId && !alreadyCoach) {
      const seatCheck = await ensureSeatsAvailable(ownerId, 1);
      if (!seatCheck.ok) {
        return {
          ok: false,
          error: "No coach seats available on this playbook. Ask the owner to free up a seat or upgrade their plan.",
        };
      }
    }
  }

  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) {
    if (error.message.includes("invite_email_mismatch")) {
      return {
        ok: false,
        error: "This invite was sent to a different email address. Sign in with that email to accept it.",
      };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Invite is invalid, expired, or fully used." };

  const playbookId = data as string;
  // First-visit-only seed. Insert-or-nothing so a returning user who
  // already customized their view is left alone.
  if (inviteRow?.playbook_id === playbookId) {
    await supabase
      .from("playbook_view_preferences")
      .insert({
        user_id: user.id,
        playbook_id: playbookId,
        preferences: sanitizeSharedPrefs(
          inviteRow.filters_snapshot as PlaybookViewPrefs | null,
        ),
      })
      .then(() => undefined, () => undefined);
  }

  const { data: member } = await supabase
    .from("playbook_members")
    .select("status")
    .eq("playbook_id", playbookId)
    .eq("user_id", user.id)
    .maybeSingle();
  const status: "active" | "pending" = member?.status === "active" ? "active" : "pending";

  return { ok: true, playbookId, status };
}
