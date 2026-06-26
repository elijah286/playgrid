"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { expandRecurrence } from "@/lib/calendar/recurrence";
import { setRsvpAction } from "@/app/actions/calendar";

export type InboxAlertKind =
  | "membership"
  | "coach_upgrade"
  | "roster_claim"
  | "rsvp_pending"
  // Phase 2 — backend not yet wired. Listed here so the UI can render
  // these uniformly once the data sources land:
  //   - system_alert: billing/trial/auth issues from a `system_alerts` table
  //   - mention: @-mentions on plays/comments via `play_comment_mentions`
  //   - share: head-coach broadcasts surfaced from `play_team_notifications`
  | "system_alert"
  | "mention"
  | "share"
  // Site-admin-only operational feed (signups, subscription events, play
  // milestones). Visible only when the caller has profiles.role = 'admin';
  // gated in the UI behind a "View system notices" checkbox.
  | "admin_notice";

export type AdminNoticeKind =
  | "user_signup"
  | "subscription_purchased"
  | "subscription_canceled"
  | "play_milestone"
  // Coach-submitted feedback (widget, contact/support form, or cancellation
  // survey) — written by the feedback triggers in 20260626120000.
  | "feedback_received"
  // A failed production functional-test run — written by the functional-tests
  // ingest endpoint (20260626150000).
  | "functional_test_failed";

/** Active = visible in the default Active view + counted in the red-bang
 *  badge. Archived = visible only in the Archived view + not counted.
 *  Deleted rows are hidden from every view (the server query filters
 *  them out), so they don't appear here. */
export type InboxAlertStatus = "active" | "archived";

/** Window for showing upcoming events without an RSVP. */
const RSVP_LOOKAHEAD_DAYS = 14;

export type InboxAlert = {
  /** Stable id for React keys + dedupe. */
  key: string;
  /** Stable id for the underlying source row, used as the inbox_state
   *  PK alongside `kind`. Format depends on kind — see the migration
   *  comment in 20260507120000_inbox_state.sql. */
  sourceId: string;
  kind: InboxAlertKind;
  /** Per-user state overlay (defaults to "active" when no row exists). */
  status: InboxAlertStatus;
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

  // system_alert / mention / share — generic body + optional deep-link.
  // Severity drives urgency bucketing for system_alert.
  body?: string | null;
  href?: string | null;
  severity?: "info" | "warn" | "critical";

  // admin_notice — site-admin operational feed. The UI uses adminKind to
  // pick a label/icon and the body holds the full headline (e.g.
  // "purchased Team Coach"); user_email/displayName are the subject.
  adminKind?: AdminNoticeKind;
  /** Subject's email — used by user_signup rows to deep-link the admin
   *  users table pre-filtered to this account. */
  userEmail?: string | null;
};

/**
 * Aggregate everything that needs the current user's attention. Coach-side:
 * pending member approvals, coach-upgrade requests, and pending roster
 * claims (owner playbooks only). Player-side: upcoming event occurrences
 * without an RSVP yet (any membership). Returns a flat list sorted
 * newest-first; the UI can re-sort.
 *
 * Site admins additionally see admin_notice rows (signups, subscription
 * starts/cancels, play milestones). `isSiteAdmin` is returned so the UI
 * can render the "View system notices" checkbox only for admins.
 */
export async function listInboxAlertsAction(): Promise<
  { ok: true; alerts: InboxAlert[]; isSiteAdmin: boolean } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();

  // Phase 1 — auth (must be first)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Phase 2 — profile + both playbook-membership lists in parallel
  const [profileRes, ownedRowsRes, memberRowsRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("playbook_members")
      .select("playbook_id, playbooks!inner(id, name, logo_url, color, is_archived)")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("status", "active")
      .eq("playbooks.is_archived", false),
    supabase
      .from("playbook_members")
      .select("playbook_id, playbooks!inner(id, name, logo_url, color, is_archived)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("playbooks.is_archived", false),
  ]);
  if (ownedRowsRes.error) return { ok: false, error: ownedRowsRes.error.message };
  if (memberRowsRes.error) return { ok: false, error: memberRowsRes.error.message };

  const isSiteAdmin = profileRes.data?.role === "admin";

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

  // Phase 3 — all per-category queries fire in parallel:
  //   • owner members + claims (if any owned playbooks)
  //   • upcoming calendar events for RSVP check (date-filtered; RSVPs fetched in phase 4)
  //   • emailed copy-share invites
  //   • admin system notices (site-admin only)
  // Note: RSVPs need event IDs, so that one follow-up query is deferred to phase 4.
  const now = new Date();
  const horizon = new Date(now.getTime() + RSVP_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  // For non-recurring events only load those that could still be upcoming.
  // Recurring events are always loaded regardless of starts_at because any
  // starts_at value may produce future occurrences via the rrule.
  const eventsCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [
    membersRes,
    claimsRes,
    eventsRes,
    shareAlerts,
    adminAlerts,
  ] = await Promise.all([
    ownedIds.length > 0
      ? supabase
          .from("playbook_members")
          .select(
            "playbook_id, user_id, role, status, created_at, coach_upgrade_requested_at, profiles:user_id(display_name)",
          )
          .in("playbook_id", ownedIds)
          .or("status.eq.pending,coach_upgrade_requested_at.not.is.null")
      : Promise.resolve({ data: [], error: null }),
    ownedIds.length > 0
      ? supabase
          .from("roster_claims")
          .select(
            "id, member_id, user_id, requested_at, note, member:member_id!inner(playbook_id, label, jersey_number, positions), profiles:user_id(display_name)",
          )
          .eq("status", "pending")
          .in("member.playbook_id", ownedIds)
      : Promise.resolve({ data: [], error: null }),
    memberIds.length > 0
      ? supabase
          .from("playbook_events")
          .select(
            "id, playbook_id, type, title, starts_at, recurrence_rule, recurrence_exdate, deleted_at",
          )
          .in("playbook_id", memberIds)
          .is("deleted_at", null)
          // Skip past one-time events entirely; keep all recurring ones.
          .or(`recurrence_rule.not.is.null,starts_at.gt.${eventsCutoff}`)
          .lt("starts_at", horizon.toISOString())
      : Promise.resolve({ data: [] as unknown[], error: null }),
    buildPendingCopySendAlerts(supabase, user.id),
    isSiteAdmin ? buildAdminNoticeAlerts(supabase) : Promise.resolve([] as InboxAlert[]),
  ]);

  if (membersRes.error) return { ok: false, error: membersRes.error.message };
  if (claimsRes.error) return { ok: false, error: claimsRes.error.message };
  if (eventsRes.error) return { ok: false, error: eventsRes.error.message };

  // Phase 4 — RSVP responses (needs event IDs from phase 3)
  const eventIds = ((eventsRes.data ?? []) as { id: string }[]).map((e) => e.id);
  const existingRsvpsRes = eventIds.length > 0
    ? await supabase
        .from("playbook_event_rsvps")
        .select("event_id, occurrence_date")
        .eq("user_id", user.id)
        .in("event_id", eventIds)
    : { data: [] as unknown[], error: null };

  // Assemble all alerts from raw query results.
  const alerts: InboxAlert[] = [];
  appendOwnerAlerts(alerts, ownerBookById, membersRes.data, claimsRes.data);

  const responded = new Set(
    ((existingRsvpsRes.data ?? []) as { event_id: string; occurrence_date: string }[]).map(
      (r) => `${r.event_id}|${r.occurrence_date}`,
    ),
  );
  alerts.push(
    ...buildRsvpAlertsFromRows(
      (eventsRes.data ?? []) as Parameters<typeof buildRsvpAlertsFromRows>[0],
      responded,
      memberBookById,
      now,
      horizon,
    ),
  );

  alerts.push(...shareAlerts);
  alerts.push(...adminAlerts);

  // ─── Per-user state overlay (archive / delete) ───────────────────────
  const stateMap = await loadInboxStateOverlay(supabase, user.id, alerts);
  const filtered: InboxAlert[] = [];
  for (const a of alerts) {
    const overlay = stateMap.get(stateOverlayKey(a.kind, a.sourceId));
    if (overlay === "deleted") continue;
    filtered.push({ ...a, status: overlay === "archived" ? "archived" : "active" });
  }

  // Coach feedback is the single highest-signal alert — pin it above
  // everything regardless of recency so it's the first thing an admin sees,
  // in both the bell drawer and the full inbox. Everything else stays
  // newest-first.
  filtered.sort((a, b) => {
    const fb = (x: InboxAlert) => (isFeedbackAlert(x) ? 0 : 1);
    return fb(a) - fb(b) || b.createdAt.localeCompare(a.createdAt);
  });
  return { ok: true, alerts: filtered, isSiteAdmin };
}

/** True for a coach-feedback admin notice — the alert we treat as top
 *  priority + red across every inbox surface. Local (not exported): this is a
 *  "use server" module, so it can only export async actions. The client mirrors
 *  this check inline (InboxTab/InboxDrawer). */
function isFeedbackAlert(a: InboxAlert): boolean {
  return a.kind === "admin_notice" && a.adminKind === "feedback_received";
}

function stateOverlayKey(kind: InboxAlertKind, sourceId: string): string {
  return `${kind}::${sourceId}`;
}

async function loadInboxStateOverlay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  alerts: InboxAlert[],
): Promise<Map<string, "archived" | "deleted">> {
  const out = new Map<string, "archived" | "deleted">();
  if (alerts.length === 0) return out;
  // RLS already restricts to auth.uid(), but pin the user_id filter so the
  // query plan can use the index even when the policy compiles to a join.
  const { data } = await supabase
    .from("inbox_state")
    .select("alert_kind, source_id, status")
    .eq("user_id", userId);
  for (const row of (data ?? []) as Array<{
    alert_kind: InboxAlertKind;
    source_id: string;
    status: "archived" | "deleted";
  }>) {
    out.set(stateOverlayKey(row.alert_kind, row.source_id), row.status);
  }
  return out;
}

async function buildAdminNoticeAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<InboxAlert[]> {
  const { data, error } = await supabase
    .from("system_notices")
    .select(
      "id, kind, severity, user_id, user_display_name, user_email, body, href, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];

  type Row = {
    id: string;
    kind: AdminNoticeKind;
    severity: "info" | "warn" | "critical";
    user_id: string | null;
    user_display_name: string | null;
    user_email: string | null;
    body: string;
    href: string | null;
    created_at: string;
  };

  return (data as Row[]).map((r) => ({
    key: `admin:${r.id}`,
    sourceId: r.id,
    status: "active" as const,
    kind: "admin_notice" as const,
    adminKind: r.kind,
    // Admin notices aren't scoped to a playbook — synthesise a "Site"
    // identity so the existing notification row UI renders cleanly.
    playbookId: "",
    playbookName: "Site",
    playbookLogoUrl: null,
    playbookColor: null,
    displayName: r.user_display_name?.trim() || r.user_email || null,
    userId: r.user_id ?? undefined,
    userEmail: r.user_email,
    createdAt: r.created_at,
    body: r.body,
    href: r.href,
    severity: r.severity,
  }));
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
      const sourceId = `${raw.playbook_id}:${raw.user_id}`;
      alerts.push({
        key: `m:${sourceId}`,
        sourceId,
        status: "active",
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
      const sourceId = `${raw.playbook_id}:${raw.user_id}`;
      alerts.push({
        key: `cu:${sourceId}`,
        sourceId,
        status: "active",
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
      sourceId: raw.id,
      status: "active",
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

async function buildPendingCopySendAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<InboxAlert[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("playbook_copy_link_sends")
    .select(
      "id, sent_at, link:link_id!inner(token, expires_at, revoked_at, playbook:playbook_id!inner(id, name, logo_url, color, is_archived)), sender:sent_by(display_name)",
    )
    .eq("recipient_user_id", userId)
    .is("claimed_at", null)
    .is("link.revoked_at", null)
    .gt("link.expires_at", nowIso);
  if (error || !data) return [];

  type LinkInner = {
    token: string;
    expires_at: string;
    revoked_at: string | null;
    playbook:
      | {
          id: string;
          name: string;
          logo_url: string | null;
          color: string | null;
          is_archived: boolean;
        }
      | {
          id: string;
          name: string;
          logo_url: string | null;
          color: string | null;
          is_archived: boolean;
        }[]
      | null;
  };
  type Row = {
    id: string;
    sent_at: string;
    link: LinkInner | LinkInner[] | null;
    sender:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
  };

  const out: InboxAlert[] = [];
  for (const raw of data as unknown as Row[]) {
    const link = Array.isArray(raw.link) ? raw.link[0] ?? null : raw.link;
    if (!link) continue;
    const pb = Array.isArray(link.playbook) ? link.playbook[0] ?? null : link.playbook;
    if (!pb || pb.is_archived) continue;
    const sender = Array.isArray(raw.sender) ? raw.sender[0] ?? null : raw.sender;
    const senderName = sender?.display_name?.trim() || "A coach";
    out.push({
      key: `share:${raw.id}`,
      sourceId: raw.id,
      status: "active" as const,
      kind: "share" as const,
      playbookId: pb.id,
      playbookName: pb.name,
      playbookLogoUrl: pb.logo_url,
      playbookColor: pb.color,
      displayName: senderName,
      createdAt: raw.sent_at,
      body: `${senderName} sent you a copy of ${pb.name}.`,
      href: `/copy/${link.token}`,
      severity: "info",
    });
  }
  return out;
}

type RsvpEventRow = {
  id: string;
  playbook_id: string;
  type: "practice" | "game" | "scrimmage" | "other";
  title: string;
  starts_at: string;
  recurrence_rule: string | null;
  recurrence_exdate: string[] | null;
};

function buildRsvpAlertsFromRows(
  events: RsvpEventRow[],
  responded: Set<string>,
  bookById: Map<string, { name: string; logo_url: string | null; color: string | null }>,
  now: Date,
  horizon: Date,
): InboxAlert[] {
  const out: InboxAlert[] = [];
  for (const e of events) {
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
      if (new Date(occ.startsAt).getTime() <= now.getTime()) continue;
      if (responded.has(`${e.id}|${occ.occurrenceDate}`)) continue;
      const sourceId = `${e.id}|${occ.occurrenceDate}`;
      out.push({
        key: `rsvp:${e.id}:${occ.occurrenceDate}`,
        sourceId,
        status: "active",
        kind: "rsvp_pending",
        playbookId: e.playbook_id,
        playbookName: book.name,
        playbookLogoUrl: book.logo_url,
        playbookColor: book.color,
        displayName: null,
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

export type ResolvedKind =
  | "membership"
  | "coach_upgrade"
  | "roster_claim"
  | "rsvp_response";

export type ResolvedAction =
  | "approved"
  | "rejected"
  | "yes"
  | "no"
  | "maybe";

export type ResolvedInboxEvent = {
  id: string;
  kind: ResolvedKind;
  action: ResolvedAction;
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
    eventId?: string | null;
    eventTitle?: string | null;
    eventStartsAt?: string | null;
    eventType?: "practice" | "game" | "scrimmage" | "other" | null;
    occurrenceDate?: string | null;
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
    kind: "membership" | "coach_upgrade" | "roster_claim";
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

  // Append the caller's own RSVP responses (newest first) so the user can see
  // confirmation of their replies. Hidden by default in the UI; the Resolved
  // view exposes a filter to show them.
  const { data: rsvpRows } = await supabase
    .from("playbook_event_rsvps")
    .select(
      "event_id, occurrence_date, status, updated_at, playbook_events!inner(id, title, type, playbook_id, playbooks!inner(id, name, logo_url, color, is_archived))",
    )
    .eq("user_id", user.id)
    .eq("playbook_events.playbooks.is_archived", false)
    .order("updated_at", { ascending: false })
    .limit(limit);

  type RsvpRow = {
    event_id: string;
    occurrence_date: string;
    status: "yes" | "no" | "maybe";
    updated_at: string;
    playbook_events:
      | {
          id: string;
          title: string | null;
          type: "practice" | "game" | "scrimmage" | "other" | null;
          playbook_id: string;
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
        }
      | {
          id: string;
          title: string | null;
          type: "practice" | "game" | "scrimmage" | "other" | null;
          playbook_id: string;
          playbooks: unknown;
        }[]
      | null;
  };

  for (const r of (rsvpRows ?? []) as unknown as RsvpRow[]) {
    const ev = Array.isArray(r.playbook_events) ? r.playbook_events[0] : r.playbook_events;
    if (!ev) continue;
    const pb = Array.isArray(ev.playbooks) ? ev.playbooks[0] : ev.playbooks;
    if (!pb || typeof pb !== "object" || !("id" in pb)) continue;
    const book = pb as {
      id: string;
      name: string;
      logo_url: string | null;
      color: string | null;
    };
    events.push({
      id: `rsvp:${r.event_id}:${r.occurrence_date}`,
      kind: "rsvp_response",
      action: r.status,
      playbookId: ev.playbook_id,
      playbookName: book.name,
      playbookLogoUrl: book.logo_url,
      playbookColor: book.color,
      subjectDisplayName: null,
      resolvedAt: r.updated_at,
      resolvedByDisplayName: null,
      detail: {
        eventId: ev.id,
        eventTitle: ev.title,
        eventType: ev.type,
        occurrenceDate: r.occurrence_date,
      },
    });
  }

  events.sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt));
  return { ok: true, events: events.slice(0, limit) };
}

// ─── Per-user state mutations (archive / delete / restore) ─────────────

/** Identifier for an alert in the per-user state overlay. */
export type AlertRef = { kind: InboxAlertKind; sourceId: string };

type StatusUpdateResult = { ok: true } | { ok: false; error: string };

async function setInboxStatusAction(
  refs: AlertRef[],
  status: "archived" | "deleted",
): Promise<StatusUpdateResult> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  if (refs.length === 0) return { ok: true };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const rows = refs.map((r) => ({
    user_id: user.id,
    alert_kind: r.kind,
    source_id: r.sourceId,
    status,
    updated_at: new Date().toISOString(),
  }));
  // Composite-PK upsert. Status flips on existing rows; new rows are
  // inserted at the requested status. RLS pins the user_id check.
  const { error } = await supabase
    .from("inbox_state")
    .upsert(rows, { onConflict: "user_id,alert_kind,source_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Archive a single alert. Hides it from Active view; visible in Archived. */
export async function archiveAlertAction(
  ref: AlertRef,
): Promise<StatusUpdateResult> {
  return setInboxStatusAction([ref], "archived");
}

/** Soft-delete a single alert. Hides it from every view. */
export async function deleteAlertAction(
  ref: AlertRef,
): Promise<StatusUpdateResult> {
  return setInboxStatusAction([ref], "deleted");
}

/** Restore an archived/deleted alert back to Active. Drops the overlay row. */
export async function unarchiveAlertAction(
  ref: AlertRef,
): Promise<StatusUpdateResult> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("inbox_state")
    .delete()
    .eq("user_id", user.id)
    .eq("alert_kind", ref.kind)
    .eq("source_id", ref.sourceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Bulk archive — single round-trip upsert. */
export async function bulkArchiveAlertsAction(
  refs: AlertRef[],
): Promise<StatusUpdateResult> {
  return setInboxStatusAction(refs, "archived");
}

/** Bulk delete — single round-trip upsert. */
export async function bulkDeleteAlertsAction(
  refs: AlertRef[],
): Promise<StatusUpdateResult> {
  return setInboxStatusAction(refs, "deleted");
}

// Bulk RSVP lives in @/app/actions/calendar (`bulkRsvpAction`). Imported there
// by the inbox bulk-action bar and the calendar list views.

/** Just the count + urgency flag for the red badge. Drives the global
 *  inbox bell's poll loop, which runs every ~60s while the tab is
 *  visible — the layout already calls `listInboxAlertsAction()` for
 *  the initial baseline, but a poller that re-fetched the full alerts
 *  payload every minute would be wasteful (each alert carries
 *  per-kind fields, playbook chrome, etc.). This trims the wire
 *  response to two numbers.
 *
 *  Server-side cost is the same — the function delegates to
 *  `listInboxAlertsAction` to keep the urgency and admin-notice
 *  filtering in one place. If that becomes a hotspot, we can later
 *  swap the implementation for a direct `select count(*)` per table. */
export async function getInboxBadgeStateAction(): Promise<
  { ok: true; count: number; urgent: boolean } | { ok: false; error: string }
> {
  const res = await listInboxAlertsAction();
  if (!res.ok) return res;
  // Same admin_notice gate the dashboard layout used to apply locally;
  // safe to apply unconditionally because non-admins never receive
  // admin_notice rows from listInboxAlertsAction in the first place
  // (the action only inserts them when isSiteAdmin is true).
  const active = res.alerts.filter((a) => a.status === "active");
  const count = active.length;
  // Coach feedback turns the bell red just like an RSVP/billing alert — it's
  // too important to sit behind a neutral badge.
  const urgent = active.some(
    (a) => a.kind === "rsvp_pending" || a.kind === "system_alert" || isFeedbackAlert(a),
  );
  return { ok: true, count, urgent };
}
