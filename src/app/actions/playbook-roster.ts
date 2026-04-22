"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type PlaybookRosterMember = {
  user_id: string;
  role: "owner" | "editor" | "viewer";
  status: "pending" | "active";
  label: string | null;
  jersey_number: string | null;
  position: string | null;
  positions: string[];
  is_minor: boolean;
  is_head_coach: boolean;
  coach_title: string | null;
  display_name: string | null;
  created_at: string;
};

export async function listPlaybookRosterAction(
  playbookId: string,
): Promise<
  | { ok: true; members: PlaybookRosterMember[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("playbook_members")
    .select(
      "user_id, role, status, label, jersey_number, position, positions, is_minor, is_head_coach, coach_title, created_at, profiles:user_id(display_name)",
    )
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const members: PlaybookRosterMember[] = (data ?? []).map((row) => {
    const prof = row.profiles as
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
    const profile = Array.isArray(prof) ? prof[0] ?? null : prof;
    return {
      user_id: row.user_id,
      role: row.role,
      status: row.status,
      label: row.label,
      jersey_number: row.jersey_number,
      position: row.position,
      positions: Array.isArray(row.positions) ? (row.positions as string[]) : [],
      is_minor: row.is_minor,
      is_head_coach: Boolean(row.is_head_coach),
      coach_title: (row.coach_title as string | null) ?? null,
      display_name: profile?.display_name ?? null,
      created_at: row.created_at,
    };
  });

  return { ok: true, members };
}

export type PendingApprovalTile = {
  playbookId: string;
  playbookName: string;
  playbookLogoUrl: string | null;
  playbookColor: string | null;
  items: Array<{
    userId: string;
    displayName: string | null;
    role: "editor" | "viewer";
    createdAt: string;
  }>;
};

/**
 * Across every playbook the current user owns, return pending-member rows
 * grouped by playbook. Used by the dashboard "People waiting to join"
 * card and the owner banner inside each playbook page.
 */
export async function listPendingApprovalsForOwnerAction(): Promise<
  { ok: true; tiles: PendingApprovalTile[] } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: ownedRows, error: ownedErr } = await supabase
    .from("playbook_members")
    .select("playbook_id, playbooks!inner(id, name, logo_url, color, is_archived)")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .eq("playbooks.is_archived", false);
  if (ownedErr) return { ok: false, error: ownedErr.message };

  type OwnedRow = {
    playbook_id: string;
    playbooks:
      | { id: string; name: string; logo_url: string | null; color: string | null }
      | { id: string; name: string; logo_url: string | null; color: string | null }[]
      | null;
  };
  const bookById = new Map<
    string,
    { name: string; logo_url: string | null; color: string | null }
  >();
  for (const r of (ownedRows ?? []) as unknown as OwnedRow[]) {
    const b = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
    if (!b) continue;
    bookById.set(b.id, { name: b.name, logo_url: b.logo_url, color: b.color });
  }
  const ownedIds = Array.from(bookById.keys());
  if (ownedIds.length === 0) return { ok: true, tiles: [] };

  const { data: pending, error: pendErr } = await supabase
    .from("playbook_members")
    .select(
      "playbook_id, user_id, role, created_at, profiles:user_id(display_name)",
    )
    .in("playbook_id", ownedIds)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (pendErr) return { ok: false, error: pendErr.message };

  type PendRow = {
    playbook_id: string;
    user_id: string;
    role: "editor" | "viewer";
    created_at: string;
    profiles:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
  };
  const grouped = new Map<string, PendingApprovalTile>();
  for (const p of (pending ?? []) as unknown as PendRow[]) {
    const book = bookById.get(p.playbook_id);
    if (!book) continue;
    const prof = Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles;
    const tile =
      grouped.get(p.playbook_id) ??
      ({
        playbookId: p.playbook_id,
        playbookName: book.name,
        playbookLogoUrl: book.logo_url,
        playbookColor: book.color,
        items: [],
      } as PendingApprovalTile);
    tile.items.push({
      userId: p.user_id,
      displayName: prof?.display_name ?? null,
      role: p.role,
      createdAt: p.created_at,
    });
    grouped.set(p.playbook_id, tile);
  }

  return { ok: true, tiles: Array.from(grouped.values()) };
}

export async function approveMemberAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_members")
    .update({ status: "active" })
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function denyMemberAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_members")
    .delete()
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

/**
 * Set a single head coach for the playbook. Clears the existing head-coach
 * flag first (enforced by a partial unique index). Pass `userId=null` to
 * clear without setting a new one.
 */
export async function setHeadCoachAction(
  playbookId: string,
  userId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();

  const { error: clearErr } = await supabase
    .from("playbook_members")
    .update({ is_head_coach: false })
    .eq("playbook_id", playbookId)
    .eq("is_head_coach", true);
  if (clearErr) return { ok: false, error: clearErr.message };

  if (userId) {
    const { error: setErr } = await supabase
      .from("playbook_members")
      .update({ is_head_coach: true })
      .eq("playbook_id", playbookId)
      .eq("user_id", userId);
    if (setErr) return { ok: false, error: setErr.message };
  }
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function setCoachTitleAction(
  playbookId: string,
  userId: string,
  title: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const cleaned = (title ?? "").trim();
  const { error } = await supabase
    .from("playbook_members")
    .update({ coach_title: cleaned.length > 0 ? cleaned : null })
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

/** Player self-service: set the positions list on your own membership row.
 *  Used by the invite-accept flow so players can declare positions up front. */
export async function setMyPositionsAction(
  playbookId: string,
  positions: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const cleaned = Array.from(
    new Set(
      positions
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0 && p.length <= 12),
    ),
  ).slice(0, 8);

  const { error } = await supabase.rpc("set_my_positions", {
    p_playbook_id: playbookId,
    p_positions: cleaned,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function removeStaffMemberAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_members")
    .delete()
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}
