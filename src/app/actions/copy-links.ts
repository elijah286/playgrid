"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
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
import { awardReferralIfApplicable } from "@/lib/data/referral-award";

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
  // typed value for the insert).
  const { data: src, error: srcErr } = await supabase
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

  // Referral credit. Best-effort — never block the claim if this fails.
  // Helper internally checks site config, idempotency, sender cap, and
  // recipient-newness; safe to call unconditionally.
  if (linkRow?.created_by && typeof linkRow.created_by === "string") {
    try {
      const admin = createServiceRoleClient();
      await awardReferralIfApplicable(admin, {
        senderId: linkRow.created_by,
        recipientId: user.id,
        recipientOwnedBeforeClaim,
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
