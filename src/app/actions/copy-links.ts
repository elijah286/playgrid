"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications/inbox-dispatch";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import {
  FREE_MAX_PLAYBOOKS_OWNED,
  tierAtLeast,
} from "@/lib/billing/features";
import { ensureDefaultWorkspace } from "@/lib/data/workspace";
import {
  copyPlaybookContents,
  copyPlaybookGameSessions,
} from "@/lib/data/playbook-copy";
import {
  maybeAwardReferralOnActivation,
  setReferredByIfEmpty,
} from "@/lib/data/referral-award";
import { getStoredResendConfig } from "@/lib/site/resend-config";

const DEFAULT_FROM_EMAIL = "XO Gridmaker <onboarding@resend.dev>";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS_PER_SEND = 20;

export type CopyLinkPreview = {
  link_id: string;
  playbook_id: string;
  playbook_name: string;
  team_name: string | null;
  season: string | null;
  sport_variant: string | null;
  logo_url: string | null;
  color: string | null;
  play_count: number;
  head_coach_name: string | null;
  sender_name: string | null;
  expires_at: string;
  exhausted: boolean;
  revoked: boolean;
  expired: boolean;
  disabled: boolean;
};

const MAX_EXPIRY_DAYS = 90;
const EMAILED_COPY_EXPIRY_DAYS = 30;

function generateToken(): string {
  return randomBytes(18).toString("base64url");
}

export async function createCopyLinkAction(input: {
  playbookId: string;
  expiresInDays?: number;
  maxUses?: number | null;
  copyGameResults?: boolean;
}): Promise<
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: callerMem } = await supabase
    .from("playbook_members")
    .select("role, status")
    .eq("playbook_id", input.playbookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    !callerMem ||
    callerMem.status !== "active" ||
    !["owner", "editor"].includes(callerMem.role as string)
  ) {
    return { ok: false, error: "You don't have permission to share this playbook." };
  }

  // Sender must be Coach+ — matches the existing share gate. Editors
  // ride on the owner's tier (the owner already paid).
  if (callerMem.role === "owner") {
    const entitlement = await getUserEntitlement(user.id);
    if (!tierAtLeast(entitlement, "coach")) {
      return {
        ok: false,
        error: "Sending a copy is a Team Coach feature. Upgrade to unlock.",
      };
    }
  }

  const days = Math.max(
    1,
    Math.min(MAX_EXPIRY_DAYS, Math.floor(input.expiresInDays ?? 30)),
  );
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const token = generateToken();

  const { error } = await supabase.from("playbook_copy_links").insert({
    playbook_id: input.playbookId,
    token,
    max_uses: input.maxUses ?? null,
    expires_at: expiresAt,
    copy_game_results: !!input.copyGameResults,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  try {
    const admin = createServiceRoleClient();
    await admin.from("share_events").insert({
      actor_user_id: user.id,
      share_kind: "playbook_copy",
      resource_id: input.playbookId,
      channel: "copy_link",
      share_token: token,
      metadata: {
        max_uses: input.maxUses ?? null,
        expires_in_days: days,
        copy_game_results: !!input.copyGameResults,
      },
    });
  } catch {
    /* best-effort telemetry */
  }

  return { ok: true, token, expiresAt };
}

export async function previewCopyLinkAction(
  token: string,
): Promise<{ ok: true; preview: CopyLinkPreview } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_link_preview", { p_token: token });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "Copy link not found." };
  return { ok: true, preview: row as CopyLinkPreview };
}

/** Recipient claims a copy link → creates a new owned playbook in their
 *  workspace, seeded with the source's plays/formations. The source is
 *  untouched; the two playbooks share no state going forward. */
export async function acceptCopyLinkAction(
  token: string,
): Promise<
  | { ok: true; playbookId: string }
  | { ok: false; error: string; needsUpgrade?: boolean }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const previewRes = await previewCopyLinkAction(token);
  if (!previewRes.ok) return { ok: false, error: previewRes.error };
  const preview = previewRes.preview;
  if (preview.revoked) return { ok: false, error: "This copy link was revoked." };
  if (preview.expired) return { ok: false, error: "This copy link has expired." };
  if (preview.exhausted) return { ok: false, error: "This copy link has reached its maximum uses." };
  if (preview.disabled) {
    return { ok: false, error: "The owner has disabled copies of this playbook." };
  }

  // Snapshot the recipient's owned-playbook count BEFORE the claim so the
  // referral-credit check can use it. Same query gates the free-tier
  // quota; reuse the value for both purposes.
  const { count: ownedCountRaw } = await supabase
    .from("playbook_members")
    .select("playbook_id, playbooks!inner(id)", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("playbooks.is_default", false);
  const recipientOwnedBeforeClaim = ownedCountRaw ?? 0;

  const entitlement = await getUserEntitlement(user.id);
  if (!tierAtLeast(entitlement, "coach")) {
    if (recipientOwnedBeforeClaim >= FREE_MAX_PLAYBOOKS_OWNED) {
      return {
        ok: false,
        error: `Free accounts are limited to ${FREE_MAX_PLAYBOOKS_OWNED} playbook. Upgrade to Team Coach to claim this copy.`,
        needsUpgrade: true,
      };
    }
  }

  // Read source metadata (we already have most of it from preview, but
  // need allow_game_results_duplication and the canonical sport_variant
  // typed value for the insert). Token validation already happened via
  // the security-definer preview RPC; the recipient isn't a member of
  // the source playbook yet, so a plain user-client read would be
  // blocked by RLS and surface as "Cannot coerce the result to a single
  // JSON object". The token IS the authorization here.
  const sourceAdmin = createServiceRoleClient();
  const { data: src, error: srcErr } = await sourceAdmin
    .from("playbooks")
    .select("name, sport_variant, custom_offense_count, color, logo_url, season, allow_game_results_duplication")
    .eq("id", preview.playbook_id)
    .single();
  if (srcErr || !src) return { ok: false, error: srcErr?.message ?? "Source playbook not found." };

  let targetTeamId: string;
  try {
    const ws = await ensureDefaultWorkspace(supabase, user.id);
    targetTeamId = ws.teamId;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not resolve workspace.",
    };
  }

  const { data: newBook, error: pbErr } = await supabase
    .from("playbooks")
    .insert({
      team_id: targetTeamId,
      name: src.name,
      sport_variant: src.sport_variant,
      custom_offense_count: src.custom_offense_count,
      color: src.color,
      logo_url: src.logo_url,
      season: src.season,
    })
    .select("id")
    .single();
  if (pbErr) return { ok: false, error: pbErr.message };

  await supabase
    .from("playbook_members")
    .insert({ playbook_id: newBook.id, user_id: user.id, role: "owner" });

  await copyPlaybookContents(supabase, preview.playbook_id, newBook.id, user.id);

  // Atomically bump uses_count / auto-revoke. If the link got pulled out
  // from under us between preview and now (race, manual revoke), roll
  // back the inserted playbook so we don't leave a half-claimed copy.
  const { data: redeemed, error: redeemErr } = await supabase.rpc("copy_link_redeem", {
    p_token: token,
  });
  if (redeemErr || redeemed === false) {
    await supabase.from("playbooks").delete().eq("id", newBook.id);
    return {
      ok: false,
      error: redeemErr?.message ?? "This copy link is no longer valid.",
    };
  }

  // Game results carry over only when the source owner opted in via
  // playbook settings AND the copy link was created with the flag on.
  // Two-sided consent prevents accidental data leakage.
  const { data: linkRow } = await supabase
    .from("playbook_copy_links")
    .select("copy_game_results, created_by")
    .eq("token", token)
    .maybeSingle();
  if (linkRow?.copy_game_results && src.allow_game_results_duplication === true) {
    await copyPlaybookGameSessions(supabase, preview.playbook_id, newBook.id, user.id);
  }

  // If this token came from an emailed send, mark the matching send row
  // claimed so the recipient's inbox alert clears. Service-role bypasses
  // the no-UPDATE-policy on the table. Best-effort — failure here doesn't
  // block the claim.
  try {
    const { data: linkIdRow } = await sourceAdmin
      .from("playbook_copy_links")
      .select("id")
      .eq("token", token)
      .maybeSingle();
    if (linkIdRow?.id) {
      await sourceAdmin
        .from("playbook_copy_link_sends")
        .update({
          claimed_at: new Date().toISOString(),
          claimed_by: user.id,
        })
        .eq("link_id", linkIdRow.id as string)
        .is("claimed_at", null);
    }
  } catch {
    /* best-effort send-claim marking */
  }

  // Referral credit. Best-effort — never block the claim if this fails.
  // Backfill the attribution edge (first referrer wins) so a coach who signed
  // up without a ?ref= still credits the sender of the copy they claim, then
  // try the award — claiming a copy is itself an activation.
  if (linkRow?.created_by && typeof linkRow.created_by === "string") {
    try {
      await setReferredByIfEmpty(sourceAdmin, user.id, linkRow.created_by);
      await maybeAwardReferralOnActivation({
        recipientId: user.id,
        trigger: "copy_claim",
      });
    } catch {
      /* never fail the claim on referral side-effects */
    }
  }

  revalidatePath("/home");
  return { ok: true, playbookId: newBook.id };
}

export async function revokeCopyLinkAction(
  linkId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_copy_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type SendCopyByEmailResult = {
  email: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  /** Set when an existing user was matched at send time — drives the
   *  "they'll see this in their inbox" hint in the dialog. */
  matchedExistingUser?: boolean;
};

/** Email a single-use copy link to each recipient. Existing users see an
 *  inbox alert linking to /copy/<token> on their next dashboard load;
 *  net-new emails get a sign-up→claim link. Caller must be owner/editor
 *  on the playbook and Coach+ (matches createCopyLinkAction). */
export async function sendCopyByEmailAction(input: {
  playbookId: string;
  emails: string[];
  copyGameResults?: boolean;
}): Promise<
  | { ok: true; results: SendCopyByEmailResult[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: callerMem } = await supabase
    .from("playbook_members")
    .select("role, status")
    .eq("playbook_id", input.playbookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    !callerMem ||
    callerMem.status !== "active" ||
    !["owner", "editor"].includes(callerMem.role as string)
  ) {
    return { ok: false, error: "You don't have permission to share this playbook." };
  }

  // Owner pays for sharing; editors ride on the owner's tier.
  if (callerMem.role === "owner") {
    const entitlement = await getUserEntitlement(user.id);
    if (!tierAtLeast(entitlement, "coach")) {
      return {
        ok: false,
        error: "Sending a copy is a Team Coach feature. Upgrade to unlock.",
      };
    }
  }

  // Normalize, validate, dedupe.
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of input.emails) {
    const e = (raw ?? "").trim().toLowerCase();
    if (!e) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    cleaned.push(e);
  }
  if (cleaned.length === 0) {
    return { ok: false, error: "Enter at least one email address." };
  }
  if (cleaned.length > MAX_EMAILS_PER_SEND) {
    return {
      ok: false,
      error: `Send up to ${MAX_EMAILS_PER_SEND} recipients at a time.`,
    };
  }

  // Resend config — bail early if email isn't deliverable.
  const cfg = await getStoredResendConfig().catch(() => ({
    apiKey: null as string | null,
    fromEmail: null as string | null,
    contactToEmail: null as string | null,
  }));
  const apiKey = cfg.apiKey ?? process.env.RESEND_API_KEY ?? null;
  const fromEmail = cfg.fromEmail ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  if (!apiKey) {
    return {
      ok: false,
      error: "Email sending isn't configured yet. Use the link or QR code instead.",
    };
  }

  // Look up existing users by email in one pass. listUsers is paginated;
  // for the user counts we have today (low thousands) a single page
  // covers it. If we outgrow that, swap in a security-definer RPC.
  const admin = createServiceRoleClient();
  const userIdByEmail = new Map<string, string>();
  try {
    let page = 1;
    while (true) {
      const { data: pageData, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) break;
      for (const u of pageData?.users ?? []) {
        const e = (u.email ?? "").toLowerCase();
        if (e) userIdByEmail.set(e, u.id);
      }
      if (!pageData?.users || pageData.users.length < 1000) break;
      page += 1;
      if (page > 10) break; // safety stop
    }
  } catch {
    /* fall through — sends still work, just no inbox alerts */
  }

  // Sender display name for the email subject + body.
  const { data: senderProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const senderName =
    (senderProfile?.display_name as string | null)?.trim() || "A coach";

  // Playbook name for the email body.
  const { data: pbRow } = await supabase
    .from("playbooks")
    .select("name")
    .eq("id", input.playbookId)
    .maybeSingle();
  const playbookName = (pbRow?.name as string | null)?.trim() || "a playbook";

  const resend = new Resend(apiKey);
  const expiresAt = new Date(
    Date.now() + EMAILED_COPY_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const results: SendCopyByEmailResult[] = [];

  for (const email of cleaned) {
    if (!EMAIL_RE.test(email)) {
      results.push({ email, status: "failed", reason: "Invalid email address." });
      continue;
    }
    if (email === (user.email ?? "").toLowerCase()) {
      results.push({ email, status: "skipped", reason: "That's your own address." });
      continue;
    }

    // 1) Create the single-use link.
    const token = generateToken();
    const { data: linkRow, error: linkErr } = await supabase
      .from("playbook_copy_links")
      .insert({
        playbook_id: input.playbookId,
        token,
        max_uses: 1,
        expires_at: expiresAt,
        copy_game_results: !!input.copyGameResults,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (linkErr || !linkRow) {
      results.push({
        email,
        status: "failed",
        reason: linkErr?.message ?? "Could not create copy link.",
      });
      continue;
    }

    // 2) Record the send (drives the inbox alert when matched).
    const matchedUserId = userIdByEmail.get(email) ?? null;
    const { error: sendErr } = await supabase
      .from("playbook_copy_link_sends")
      .insert({
        link_id: linkRow.id as string,
        recipient_email: email,
        recipient_user_id: matchedUserId,
        sent_by: user.id,
      });
    if (sendErr) {
      // Roll back the link so we don't leave an orphaned one.
      await supabase.from("playbook_copy_links").delete().eq("id", linkRow.id as string);
      results.push({
        email,
        status: "failed",
        reason: sendErr.message,
      });
      continue;
    }

    // 2b) Native push when the recipient is an existing user — mirrors the
    // derived "share" inbox alert so the device matches the in-app feed.
    if (matchedUserId) {
      try {
        await notifyUser({
          admin,
          userId: matchedUserId,
          category: "shares_mentions",
          message: {
            title: `${senderName} shared a playbook`,
            body: `${senderName} shared "${playbookName}" with you.`,
            link: `/copy/${token}`,
          },
        });
      } catch {
        // best-effort
      }
    }

    // 3) Send the email.
    const claimUrl = `${SITE_URL}/copy/${token}`;
    const { text, html } = buildCopyEmailHtml({
      senderName,
      playbookName,
      claimUrl,
      hasAccount: !!matchedUserId,
    });
    try {
      const { error: emailErr } = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `${senderName} sent you a copy of ${playbookName}`,
        text,
        html,
      });
      if (emailErr) {
        results.push({
          email,
          status: "failed",
          reason: emailErr.message ?? "Email send failed.",
        });
        continue;
      }
    } catch (e) {
      results.push({
        email,
        status: "failed",
        reason: e instanceof Error ? e.message : "Email send failed.",
      });
      continue;
    }

    // 4) Best-effort telemetry parity with createCopyLinkAction.
    try {
      await admin.from("share_events").insert({
        actor_user_id: user.id,
        share_kind: "playbook_copy",
        resource_id: input.playbookId,
        channel: "email",
        share_token: token,
        metadata: {
          recipient_email: email,
          matched_existing_user: !!matchedUserId,
          copy_game_results: !!input.copyGameResults,
        },
      });
    } catch {
      /* best-effort telemetry */
    }

    results.push({
      email,
      status: "sent",
      matchedExistingUser: !!matchedUserId,
    });
  }

  return { ok: true, results };
}

function buildCopyEmailHtml(args: {
  senderName: string;
  playbookName: string;
  claimUrl: string;
  hasAccount: boolean;
}): { text: string; html: string } {
  const sender = escapeHtml(args.senderName);
  const playbook = escapeHtml(args.playbookName);
  const url = args.claimUrl;
  const intro = args.hasAccount
    ? `${args.senderName} sent you their own playbook, "${args.playbookName}", on XO Gridmaker. Open the link below to claim a free editable copy in your account.`
    : `${args.senderName} sent you their own playbook, "${args.playbookName}", on XO Gridmaker. The link below will walk you through a quick free sign-up and drop the playbook into your account.`;
  const text = [
    intro,
    "",
    `Claim your copy: ${url}`,
    "",
    "The recipient gets a standalone, editable copy — your future edits won't reach them, and theirs won't reach you. Link expires in 30 days.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family:ui-sans-serif,system-ui,Segoe UI,Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">${sender} sent you a playbook</h1>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.5">
        ${sender} sent you a copy of <strong>${playbook}</strong> on XO Gridmaker. Click the button to claim your own editable copy — yours to keep, edit, and share.
      </p>
      <p style="margin:24px 0">
        <a href="${url}" style="display:inline-block;padding:12px 20px;background:#16a34a;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          ${args.hasAccount ? "Claim your copy" : "Sign up and claim"}
        </a>
      </p>
      <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5">
        Or paste this link into your browser:<br>
        <span style="color:#475569">${url}</span>
      </p>
      <p style="margin:16px 0 0;color:#64748b;font-size:12px">
        Link expires in 30 days. You'll get a standalone, editable copy — ${sender}'s future edits won't reach you, and yours won't reach them.
      </p>
    </td></tr>
  </table>
</body></html>`;
  return { text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
