"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

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
