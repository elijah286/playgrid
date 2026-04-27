"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { expandRecurrence } from "@/lib/calendar/recurrence";

export type InboxAlertKind =
  | "membership"
  | "coach_upgrade"
  | "roster_claim"
  | "rsvp_pending";

/** Window for showing upcoming events without an RSVP. */
const RSVP_LOOKAHEAD_DAYS = 14;

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

  // rsvp_pending
  eventId?: string;
  occurrenceDate?: string;
  eventTitle?: string;
  eventStartsAt?: string;
  eventType?: "practice" | "game" | "scrimmage" | "other";
};

/**
 * Aggregate everything that needs the current user's attention. Coach-side:
 * pending member approvals, coach-upgrade requests, and pending roster
 * claims (owner playbooks only). Player-side: upcoming event occurrences
 * without an RSVP yet (any membership). Returns a flat list sorted
 * newest-first; the UI can re-sort.
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

  const [ownedRowsRes, memberRowsRes] = await Promise.all([
    supabase
      .from("playbook_members")
      .select(
        "playbook_id, playbooks!inner(id, name, logo_url, color, is_archived)",
      )
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("status", "active")
      .eq("playbooks.is_archived", false),
    supabase
      .from("playbook_members")
      .select(
        "playbook_id, playbooks!inner(id, name, logo_url, color, is_archived)",
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("playbooks.is_archived", false),
  ]);
  if (ownedRowsRes.error) return { ok: false, error: ownedRowsRes.error.message };
  if (memberRowsRes.error) return { ok: false, error: memberRowsRes.error.message };

  type PbJoinRow = {
    playbook_id: string;
    playbooks:
      | { id: string; name: string; logo_url: string | null; color: string | null }
      | { id: string; name: string; logo_url: string | null; color: string | null }[]
      | null;
  };
  function indexBooks(rows: PbJoinRow[]): Map<
    string,
    { name: string; logo_url: string | null; color: string | null }
  > {
    const m = new Map<
      string,
      { name: string; logo_url: string | null; color: string | null }
    >();
    for (const r of rows) {
      const b = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
      if (!b) continue;
      m.set(b.id, { name: b.name, logo_url: b.logo_url, color: b.color });
    }
    return m;
  }
  const ownerBookById = indexBooks(
    (ownedRowsRes.data ?? []) as unknown as PbJoinRow[],
  );
  const memberBookById = indexBooks(
    (memberRowsRes.data ?? []) as unknown as PbJoinRow[],
  );
  const ownedIds = Array.from(ownerBookById.keys());
  const memberIds = Array.from(memberBookById.keys());

  const alerts: InboxAlert[] = [];

  // ─── Owner-side alerts ───────────────────────────────────────────────
  if (ownedIds.length > 0) {
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

    appendOwnerAlerts(alerts, ownerBookById, membersRes.data, claimsRes.data);
  }

  // ─── Player-side alerts: outstanding RSVPs ───────────────────────────
  if (memberIds.length > 0) {
    const rsvpAlerts = await buildRsvpPendingAlerts(
      supabase,
      user.id,
      memberIds,
      memberBookById,
    );
    alerts.push(...rsvpAlerts);
  }

  alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, alerts };
}

function appendOwnerAlerts(
  alerts: InboxAlert[],
  bookById: Map<string, { name: string; logo_url: string | null; color: string | null }>,
  membersData: unknown,
  claimsData: unknown,
): void {

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
  for (const raw of (membersData ?? []) as unknown as MemRow[]) {
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
  for (const raw of (claimsData ?? []) as unknown as ClaimRow[]) {
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
}

async function buildRsvpPendingAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  playbookIds: string[],
  bookById: Map<string, { name: string; logo_url: string | null; color: string | null }>,
): Promise<InboxAlert[]> {
  const { data: events, error } = await supabase
    .from("playbook_events")
    .select(
      "id, playbook_id, type, title, starts_at, recurrence_rule, recurrence_exdate, deleted_at",
    )
    .in("playbook_id", playbookIds)
    .is("deleted_at", null);
  if (error || !events || events.length === 0) return [];

  type EventRow = {
    id: string;
    playbook_id: string;
    type: "practice" | "game" | "scrimmage" | "other";
    title: string;
    starts_at: string;
    recurrence_rule: string | null;
    recurrence_exdate: string[] | null;
  };

  const now = new Date();
  const horizon = new Date(now.getTime() + RSVP_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const eventIds = (events as EventRow[]).map((e) => e.id);
  const { data: existingRsvps } = await supabase
    .from("playbook_event_rsvps")
    .select("event_id, occurrence_date")
    .eq("user_id", userId)
    .in("event_id", eventIds);
  const responded = new Set(
    ((existingRsvps ?? []) as { event_id: string; occurrence_date: string }[]).map(
      (r) => `${r.event_id}|${r.occurrence_date}`,
    ),
  );

  const out: InboxAlert[] = [];
  for (const e of events as EventRow[]) {
    const book = bookById.get(e.playbook_id);
    if (!book) continue;
    const occurrences = expandRecurrence({
      startsAt: e.starts_at,
      recurrenceRule: e.recurrence_rule,
      exdates: e.recurrence_exdate ?? [],
      windowStart: now,
      windowEnd: horizon,
    });
    for (const occ of occurrences) {
      const startMs = new Date(occ.startsAt).getTime();
      // Skip occurrences that already started (RSVP locked).
      if (startMs <= now.getTime()) continue;
      const k = `${e.id}|${occ.occurrenceDate}`;
      if (responded.has(k)) continue;
      out.push({
        key: `rsvp:${e.id}:${occ.occurrenceDate}`,
        kind: "rsvp_pending",
        playbookId: e.playbook_id,
        playbookName: book.name,
        playbookLogoUrl: book.logo_url,
        playbookColor: book.color,
        displayName: null,
        // For sort: use the event's start-time (sooner-first surfaces via
        // newest sort because b > a on dates further in the future).
        createdAt: occ.startsAt,
        eventId: e.id,
        occurrenceDate: occ.occurrenceDate,
        eventTitle: e.title,
        eventStartsAt: occ.startsAt,
        eventType: e.type,
      });
    }
  }
  return out;
}

export type ResolvedInboxEvent = {
  id: string;
  kind: InboxAlertKind;
  action: "approved" | "rejected";
  playbookId: string;
  playbookName: string;
  playbookLogoUrl: string | null;
  playbookColor: string | null;
  subjectDisplayName: string | null;
  resolvedAt: string;
  resolvedByDisplayName: string | null;
  detail: {
    rosterLabel?: string | null;
    jerseyNumber?: string | null;
    role?: "owner" | "editor" | "viewer" | null;
    note?: string | null;
  };
};

/** Most-recent-first audit log of inbox actions taken on the caller's owned playbooks. */
export async function listResolvedInboxEventsAction(
  limit = 100,
): Promise<
  | { ok: true; events: ResolvedInboxEvent[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: rows, error } = await supabase
    .from("inbox_events")
    .select(
      "id, kind, action, playbook_id, subject_display_name, resolved_at, resolved_by, detail, playbooks!inner(id, name, logo_url, color, is_archived)",
    )
    .eq("playbooks.is_archived", false)
    .order("resolved_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };

  type Row = {
    id: string;
    kind: InboxAlertKind;
    action: "approved" | "rejected";
    playbook_id: string;
    subject_display_name: string | null;
    resolved_at: string;
    resolved_by: string;
    detail: ResolvedInboxEvent["detail"] | null;
    playbooks:
      | {
          id: string;
          name: string;
          logo_url: string | null;
          color: string | null;
        }
      | {
          id: string;
          name: string;
          logo_url: string | null;
          color: string | null;
        }[]
      | null;
  };

  const resolverIds = Array.from(
    new Set((rows ?? []).map((r) => (r as Row).resolved_by)),
  );
  const resolverNames = new Map<string, string | null>();
  if (resolverIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", resolverIds);
    for (const p of profs ?? []) {
      resolverNames.set(
        p.id as string,
        (p.display_name as string | null) ?? null,
      );
    }
  }

  const events: ResolvedInboxEvent[] = [];
  for (const r of (rows ?? []) as unknown as Row[]) {
    const pb = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
    if (!pb) continue;
    events.push({
      id: r.id,
      kind: r.kind,
      action: r.action,
      playbookId: r.playbook_id,
      playbookName: pb.name,
      playbookLogoUrl: pb.logo_url,
      playbookColor: pb.color,
      subjectDisplayName: r.subject_display_name,
      resolvedAt: r.resolved_at,
      resolvedByDisplayName: resolverNames.get(r.resolved_by) ?? null,
      detail: r.detail ?? {},
    });
  }
  return { ok: true, events };
}
