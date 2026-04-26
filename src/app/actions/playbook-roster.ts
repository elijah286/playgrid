"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { sendRosterClaimNotification } from "@/lib/notifications/roster-claim-email";
import {
  lookupDisplayName,
  recordInboxEvent,
} from "@/lib/inbox/record-event";

export type PlaybookRosterMember = {
  id: string;
  user_id: string | null;
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
  coach_upgrade_requested_at: string | null;
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
      "id, user_id, role, status, label, jersey_number, position, positions, is_minor, is_head_coach, coach_title, created_at, coach_upgrade_requested_at, profiles:user_id(display_name)",
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
      id: row.id,
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
      coach_upgrade_requested_at:
        (row.coach_upgrade_requested_at as string | null) ?? null,
    };
  });

  return { ok: true, members };
}

export type PendingApprovalItem = {
  userId: string;
  displayName: string | null;
  role: "editor" | "viewer";
  createdAt: string;
  /**
   * `membership` = user hasn't been approved to join yet.
   * `coach_upgrade` = user is already an active player who asked to be
   * upgraded to coach (editor).
   */
  kind: "membership" | "coach_upgrade";
};

export type PendingApprovalTile = {
  playbookId: string;
  playbookName: string;
  playbookLogoUrl: string | null;
  playbookColor: string | null;
  items: PendingApprovalItem[];
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
      "playbook_id, user_id, role, status, created_at, coach_upgrade_requested_at, profiles:user_id(display_name)",
    )
    .in("playbook_id", ownedIds)
    .or("status.eq.pending,coach_upgrade_requested_at.not.is.null")
    .order("created_at", { ascending: true });
  if (pendErr) return { ok: false, error: pendErr.message };

  type PendRow = {
    playbook_id: string;
    user_id: string;
    role: "owner" | "editor" | "viewer";
    status: "pending" | "active";
    created_at: string;
    coach_upgrade_requested_at: string | null;
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
    if (p.status === "pending" && (p.role === "editor" || p.role === "viewer")) {
      tile.items.push({
        userId: p.user_id,
        displayName: prof?.display_name ?? null,
        role: p.role,
        createdAt: p.created_at,
        kind: "membership",
      });
    }
    // A player who's already active and asked to be upgraded to coach.
    // (If status is still pending we only surface the membership request;
    // the upgrade gets its own item once the player approval lands.)
    if (
      p.coach_upgrade_requested_at &&
      p.status === "active" &&
      p.role === "viewer"
    ) {
      tile.items.push({
        userId: p.user_id,
        displayName: prof?.display_name ?? null,
        role: "editor",
        createdAt: p.coach_upgrade_requested_at,
        kind: "coach_upgrade",
      });
    }
    if (tile.items.length > 0) grouped.set(p.playbook_id, tile);
  }

  return { ok: true, tiles: Array.from(grouped.values()) };
}

export async function approveCoachUpgradeAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const subjectName = await lookupDisplayName(supabase, userId);
  const { error } = await supabase
    .from("playbook_members")
    .update({ role: "editor", coach_upgrade_requested_at: null })
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  await recordInboxEvent(supabase, {
    playbookId,
    kind: "coach_upgrade",
    action: "approved",
    subjectUserId: userId,
    subjectDisplayName: subjectName,
    detail: { role: "editor" },
    resolvedBy: user.id,
  });
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function denyCoachUpgradeAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const subjectName = await lookupDisplayName(supabase, userId);
  const { error } = await supabase
    .from("playbook_members")
    .update({ coach_upgrade_requested_at: null })
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  await recordInboxEvent(supabase, {
    playbookId,
    kind: "coach_upgrade",
    action: "rejected",
    subjectUserId: userId,
    subjectDisplayName: subjectName,
    resolvedBy: user.id,
  });
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function approveMemberAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: snap } = await supabase
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", playbookId)
    .eq("user_id", userId)
    .maybeSingle();
  const subjectName = await lookupDisplayName(supabase, userId);
  const { error } = await supabase
    .from("playbook_members")
    .update({ status: "active" })
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  await recordInboxEvent(supabase, {
    playbookId,
    kind: "membership",
    action: "approved",
    subjectUserId: userId,
    subjectDisplayName: subjectName,
    detail: {
      role: (snap?.role as "editor" | "viewer" | "owner" | undefined) ?? null,
    },
    resolvedBy: user.id,
  });
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function denyMemberAction(
  playbookId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: snap } = await supabase
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", playbookId)
    .eq("user_id", userId)
    .maybeSingle();
  const subjectName = await lookupDisplayName(supabase, userId);
  const { error } = await supabase
    .from("playbook_members")
    .delete()
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  await recordInboxEvent(supabase, {
    playbookId,
    kind: "membership",
    action: "rejected",
    subjectUserId: userId,
    subjectDisplayName: subjectName,
    detail: {
      role: (snap?.role as "editor" | "viewer" | "owner" | undefined) ?? null,
    },
    resolvedBy: user.id,
  });
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

export type PendingRosterClaim = {
  id: string;
  memberId: string;
  playbookId: string;
  userId: string;
  userDisplayName: string | null;
  memberLabel: string | null;
  memberJerseyNumber: string | null;
  memberPositions: string[];
  requestedAt: string;
  note: string | null;
};

/**
 * Coach: list pending roster claims across one playbook (or all
 * playbooks the caller owns, if `playbookId` is omitted). Used by the
 * roster panel's "Player claims" section and the dashboard banner.
 */
export async function listPendingRosterClaimsAction(
  playbookId?: string,
): Promise<
  { ok: true; claims: PendingRosterClaim[] } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let query = supabase
    .from("roster_claims")
    .select(
      "id, member_id, user_id, requested_at, note, member:member_id(playbook_id, label, jersey_number, positions), profiles:user_id(display_name)",
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  // RLS already restricts what the coach can see, but scoping explicitly
  // avoids a join filter round-trip when we know the playbook.
  if (playbookId) {
    // Supabase PostgREST doesn't let us filter an inner-joined column via
    // .eq directly; use the nested resource filter instead.
    query = query.eq("member.playbook_id", playbookId);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  type Row = {
    id: string;
    member_id: string;
    user_id: string;
    requested_at: string;
    note: string | null;
    member:
      | {
          playbook_id: string;
          label: string | null;
          jersey_number: string | null;
          positions: string[] | null;
        }
      | { playbook_id: string; label: string | null; jersey_number: string | null; positions: string[] | null }[]
      | null;
    profiles:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
  };

  const claims: PendingRosterClaim[] = (data ?? [])
    .map((raw) => {
      const row = raw as unknown as Row;
      const m = Array.isArray(row.member) ? row.member[0] ?? null : row.member;
      if (!m) return null;
      const prof = Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles;
      return {
        id: row.id,
        memberId: row.member_id,
        playbookId: m.playbook_id,
        userId: row.user_id,
        userDisplayName: prof?.display_name ?? null,
        memberLabel: m.label,
        memberJerseyNumber: m.jersey_number,
        memberPositions: Array.isArray(m.positions) ? m.positions : [],
        requestedAt: row.requested_at,
        note: row.note,
      } satisfies PendingRosterClaim;
    })
    .filter((c): c is PendingRosterClaim => c !== null);

  return { ok: true, claims };
}

export async function approveRosterClaimAction(
  playbookId: string,
  claimId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: snap } = await supabase
    .from("roster_claims")
    .select(
      "user_id, note, member:member_id(label, jersey_number)",
    )
    .eq("id", claimId)
    .maybeSingle();
  const claimUserId = (snap?.user_id as string | undefined) ?? null;
  const memberSnap = Array.isArray(snap?.member) ? snap?.member[0] : snap?.member;
  const subjectName = claimUserId
    ? await lookupDisplayName(supabase, claimUserId)
    : null;
  const { error } = await supabase.rpc("approve_roster_claim", {
    p_claim_id: claimId,
  });
  if (error) return { ok: false, error: error.message };
  await recordInboxEvent(supabase, {
    playbookId,
    kind: "roster_claim",
    action: "approved",
    subjectUserId: claimUserId,
    subjectDisplayName: subjectName,
    detail: {
      rosterLabel: memberSnap?.label ?? null,
      jerseyNumber: memberSnap?.jersey_number ?? null,
      note: snap?.note ?? null,
    },
    resolvedBy: user.id,
  });
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export async function rejectRosterClaimAction(
  playbookId: string,
  claimId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: snap } = await supabase
    .from("roster_claims")
    .select(
      "user_id, note, member:member_id(label, jersey_number)",
    )
    .eq("id", claimId)
    .maybeSingle();
  const claimUserId = (snap?.user_id as string | undefined) ?? null;
  const memberSnap = Array.isArray(snap?.member) ? snap?.member[0] : snap?.member;
  const subjectName = claimUserId
    ? await lookupDisplayName(supabase, claimUserId)
    : null;
  const { error } = await supabase.rpc("reject_roster_claim", {
    p_claim_id: claimId,
  });
  if (error) return { ok: false, error: error.message };
  await recordInboxEvent(supabase, {
    playbookId,
    kind: "roster_claim",
    action: "rejected",
    subjectUserId: claimUserId,
    subjectDisplayName: subjectName,
    detail: {
      rosterLabel: memberSnap?.label ?? null,
      jerseyNumber: memberSnap?.jersey_number ?? null,
      note: snap?.note ?? null,
    },
    resolvedBy: user.id,
  });
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

export type UnclaimedRosterEntry = {
  id: string;
  label: string | null;
  jersey_number: string | null;
  positions: string[];
  position: string | null;
  is_minor: boolean;
};

/**
 * Player: list unclaimed roster entries on a playbook the caller belongs
 * to. Drives the "Claim your player" step of the invite flow.
 */
export async function listUnclaimedRosterAction(
  playbookId: string,
): Promise<
  { ok: true; entries: UnclaimedRosterEntry[] } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("playbook_members")
    .select("id, label, jersey_number, positions, position, is_minor")
    .eq("playbook_id", playbookId)
    .is("user_id", null)
    .order("label", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const entries: UnclaimedRosterEntry[] = (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    jersey_number: row.jersey_number,
    positions: Array.isArray(row.positions) ? (row.positions as string[]) : [],
    position: row.position,
    is_minor: Boolean(row.is_minor),
  }));
  return { ok: true, entries };
}

/**
 * Player: request to claim an unclaimed roster entry. The coach must
 * approve before user_id on the entry is set.
 */
export async function submitRosterClaimAction(input: {
  memberId: string;
  note?: string | null;
}): Promise<{ ok: true; claimId: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("submit_roster_claim", {
    p_member_id: input.memberId,
    p_note: input.note ?? null,
  });
  if (error) return { ok: false, error: error.message };

  // Best-effort notification — don't block the player on email failures.
  if (user) {
    const { data: m } = await supabase
      .from("playbook_members")
      .select("playbook_id, label")
      .eq("id", input.memberId)
      .maybeSingle();
    if (m?.playbook_id) {
      await sendRosterClaimNotification({
        playbookId: m.playbook_id as string,
        claimingUserId: user.id,
        rosterLabel: (m.label as string | null) ?? null,
      }).catch(() => {});
    }
  }
  return { ok: true, claimId: data as string };
}

/**
 * Coach: add an unclaimed roster entry (a "player slot" not yet linked
 * to any user account). A player claims the slot later via the invite
 * flow, at which point the coach approves and the user_id gets set.
 */
export async function addRosterEntryAction(input: {
  playbookId: string;
  label: string;
  jerseyNumber?: string | null;
  positions?: string[];
  isMinor?: boolean;
}): Promise<{ ok: true; memberId: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const label = (input.label ?? "").trim();
  if (!label) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const cleanedPositions = Array.from(
    new Set(
      (input.positions ?? [])
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0 && p.length <= 12),
    ),
  ).slice(0, 8);

  const { data, error } = await supabase.rpc("add_roster_entry", {
    p_playbook_id: input.playbookId,
    p_label: label,
    p_jersey_number: input.jerseyNumber ?? null,
    p_positions: cleanedPositions,
    p_is_minor: input.isMinor ?? false,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${input.playbookId}`);
  return { ok: true, memberId: data as string };
}

/**
 * Coach: bulk-add multiple unclaimed roster entries in one round-trip.
 * Names are trimmed; blanks are skipped. Cap at 30 per call so the
 * quick-add dialog can't accidentally spam the DB.
 */
export async function bulkAddRosterEntriesAction(input: {
  playbookId: string;
  labels: string[];
}): Promise<
  { ok: true; added: number } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const cleaned = input.labels
    .map((l) => (typeof l === "string" ? l.trim() : ""))
    .filter((l) => l.length > 0)
    .slice(0, 30);
  if (cleaned.length === 0) return { ok: false, error: "No names provided." };

  const supabase = await createClient();
  let added = 0;
  for (const label of cleaned) {
    const { error } = await supabase.rpc("add_roster_entry", {
      p_playbook_id: input.playbookId,
      p_label: label,
      p_jersey_number: null,
      p_positions: [],
      p_is_minor: false,
    });
    if (error) {
      if (added > 0) revalidatePath(`/playbooks/${input.playbookId}`);
      return { ok: false, error: error.message };
    }
    added += 1;
  }
  revalidatePath(`/playbooks/${input.playbookId}`);
  return { ok: true, added };
}

/**
 * Coach: edit roster fields on any member row (name/label, jersey,
 * positions, minor flag). RLS lets any editor of the playbook update;
 * we clean inputs the same way the Add dialog does.
 */
export async function updateRosterEntryAction(input: {
  playbookId: string;
  memberId: string;
  label?: string | null;
  jerseyNumber?: string | null;
  positions?: string[];
  isMinor?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) {
    const cleaned = (input.label ?? "").trim();
    patch.label = cleaned.length > 0 ? cleaned : null;
  }
  if (input.jerseyNumber !== undefined) {
    const cleaned = (input.jerseyNumber ?? "").trim();
    patch.jersey_number = cleaned.length > 0 ? cleaned : null;
  }
  if (input.positions !== undefined) {
    const cleaned = Array.from(
      new Set(
        input.positions
          .map((p) => (typeof p === "string" ? p.trim() : ""))
          .filter((p) => p.length > 0 && p.length <= 12),
      ),
    ).slice(0, 8);
    patch.positions = cleaned;
    patch.position = cleaned[0] ?? null;
  }
  if (input.isMinor !== undefined) {
    patch.is_minor = input.isMinor;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from("playbook_members")
    .update(patch)
    .eq("playbook_id", input.playbookId)
    .eq("id", input.memberId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${input.playbookId}`);
  return { ok: true };
}

/**
 * Coach: switch a member between player and coach. Owners can't be
 * demoted here — that requires a dedicated transfer-ownership flow.
 * Unclaimed entries are locked to viewer by the DB check constraint.
 */
export async function setMemberRoleAction(input: {
  playbookId: string;
  memberId: string;
  role: "viewer" | "editor";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();

  const { data: current, error: readErr } = await supabase
    .from("playbook_members")
    .select("role, user_id, is_head_coach")
    .eq("id", input.memberId)
    .single();
  if (readErr) return { ok: false, error: readErr.message };
  if (!current) return { ok: false, error: "Member not found." };
  if (current.role === "owner") {
    return { ok: false, error: "Owner role can't be changed here." };
  }
  if (current.user_id === null) {
    return { ok: false, error: "Unclaimed roster spots stay as players." };
  }

  const patch: Record<string, unknown> = { role: input.role };
  // Demoting a coach → clear coach-only fields so the player view is clean.
  if (input.role === "viewer") {
    patch.is_head_coach = false;
    patch.coach_title = null;
  }

  const { error } = await supabase
    .from("playbook_members")
    .update(patch)
    .eq("playbook_id", input.playbookId)
    .eq("id", input.memberId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${input.playbookId}`);
  return { ok: true };
}

/**
 * Coach: unlink a claimed roster entry from its user. The roster spot
 * returns to unclaimed status and the user keeps playbook access as a
 * fresh self-member row (so we don't silently yank access when the
 * coach only wanted to fix a bad match).
 */
export async function unlinkRosterEntryAction(
  playbookId: string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlink_roster_entry", {
    p_member_id: memberId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

/**
 * Coach: link an already-joined user to an unclaimed roster entry.
 * Absorbs the user's self-member row so they don't end up with two
 * slots on the playbook.
 */
export async function linkRosterEntryAction(
  playbookId: string,
  memberId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_roster_entry", {
    p_member_id: memberId,
    p_user_id: userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/playbooks/${playbookId}`);
  return { ok: true };
}

/**
 * Coach: remove a roster entry. If it's unclaimed, just deletes the
 * row. If it's claimed, the corresponding user also loses playbook
 * access — callers should prefer `unlinkRosterEntryAction` when they
 * only want to detach the user, not kick them.
 */
export async function deleteRosterEntryAction(
  playbookId: string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_members")
    .delete()
    .eq("playbook_id", playbookId)
    .eq("id", memberId);
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
