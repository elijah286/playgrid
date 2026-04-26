"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export type InboxAlertKind =
  | "membership"
  | "coach_upgrade"
  | "roster_claim";

export type InboxAlert = {
  /** Stable id for React keys + dedupe. */
  key: string;
  kind: InboxAlertKind;
  playbookId: string;
  playbookName: string;
  playbookLogoUrl: string | null;
  playbookColor: string | null;
  displayName: string | null;
  /** ISO timestamp when the request was raised. */
  createdAt: string;

  // membership / coach_upgrade
  userId?: string;
  role?: "editor" | "viewer";

  // roster_claim
  claimId?: string;
  rosterLabel?: string | null;
  jerseyNumber?: string | null;
  positions?: string[];
  note?: string | null;
};

/**
 * Aggregate everything that needs the current user's attention as a
 * playbook owner: pending member approvals, coach upgrade requests, and
 * pending roster claims. Returns a flat list sorted newest-first; the
 * UI can re-sort.
 */
export async function listInboxAlertsAction(): Promise<
  { ok: true; alerts: InboxAlert[] } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: ownedRows, error: ownedErr } = await supabase
    .from("playbook_members")
    .select(
      "playbook_id, playbooks!inner(id, name, logo_url, color, is_archived)",
    )
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
  if (ownedIds.length === 0) return { ok: true, alerts: [] };

  const [membersRes, claimsRes] = await Promise.all([
    supabase
      .from("playbook_members")
      .select(
        "playbook_id, user_id, role, status, created_at, coach_upgrade_requested_at, profiles:user_id(display_name)",
      )
      .in("playbook_id", ownedIds)
      .or("status.eq.pending,coach_upgrade_requested_at.not.is.null"),
    supabase
      .from("roster_claims")
      .select(
        "id, member_id, user_id, requested_at, note, member:member_id!inner(playbook_id, label, jersey_number, positions), profiles:user_id(display_name)",
      )
      .eq("status", "pending")
      .in("member.playbook_id", ownedIds),
  ]);
  if (membersRes.error) return { ok: false, error: membersRes.error.message };
  if (claimsRes.error) return { ok: false, error: claimsRes.error.message };

  const alerts: InboxAlert[] = [];

  type MemRow = {
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
  for (const raw of (membersRes.data ?? []) as unknown as MemRow[]) {
    const book = bookById.get(raw.playbook_id);
    if (!book) continue;
    const prof = Array.isArray(raw.profiles) ? raw.profiles[0] ?? null : raw.profiles;
    if (raw.status === "pending" && (raw.role === "editor" || raw.role === "viewer")) {
      alerts.push({
        key: `m:${raw.playbook_id}:${raw.user_id}`,
        kind: "membership",
        playbookId: raw.playbook_id,
        playbookName: book.name,
        playbookLogoUrl: book.logo_url,
        playbookColor: book.color,
        displayName: prof?.display_name ?? null,
        createdAt: raw.created_at,
        userId: raw.user_id,
        role: raw.role,
      });
    }
    if (
      raw.coach_upgrade_requested_at &&
      raw.status === "active" &&
      raw.role === "viewer"
    ) {
      alerts.push({
        key: `cu:${raw.playbook_id}:${raw.user_id}`,
        kind: "coach_upgrade",
        playbookId: raw.playbook_id,
        playbookName: book.name,
        playbookLogoUrl: book.logo_url,
        playbookColor: book.color,
        displayName: prof?.display_name ?? null,
        createdAt: raw.coach_upgrade_requested_at,
        userId: raw.user_id,
        role: "editor",
      });
    }
  }

  type ClaimRow = {
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
      | {
          playbook_id: string;
          label: string | null;
          jersey_number: string | null;
          positions: string[] | null;
        }[]
      | null;
    profiles:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
  };
  for (const raw of (claimsRes.data ?? []) as unknown as ClaimRow[]) {
    const m = Array.isArray(raw.member) ? raw.member[0] ?? null : raw.member;
    if (!m) continue;
    const book = bookById.get(m.playbook_id);
    if (!book) continue;
    const prof = Array.isArray(raw.profiles) ? raw.profiles[0] ?? null : raw.profiles;
    alerts.push({
      key: `rc:${raw.id}`,
      kind: "roster_claim",
      playbookId: m.playbook_id,
      playbookName: book.name,
      playbookLogoUrl: book.logo_url,
      playbookColor: book.color,
      displayName: prof?.display_name ?? null,
      createdAt: raw.requested_at,
      claimId: raw.id,
      rosterLabel: m.label,
      jerseyNumber: m.jersey_number,
      positions: Array.isArray(m.positions) ? m.positions : [],
      note: raw.note,
    });
  }

  alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, alerts };
}
