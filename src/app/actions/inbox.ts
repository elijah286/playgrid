"use server";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { setRsvpAction } from "@/app/actions/calendar";
import { deriveInboxAlerts, isFeedbackAlert } from "@/lib/inbox/derive";

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
  | "functional_test_failed"
  // What a coach did on the App Store rating nudge — left a review or dismissed
  // it. Written directly by recordRatingOutcome (20260702130000).
  | "review_prompt";

/** Active = visible in the default Active view + counted in the red-bang
 *  badge. Archived = visible only in the Archived view + not counted.
 *  Deleted rows are hidden from every view (the server query filters
 *  them out), so they don't appear here. */
export type InboxAlertStatus = "active" | "archived";

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
  /** Referrer for a user_signup sourced from a playbook invite link — the
   *  coach whose invite this person signed up through. Set from
   *  system_notices.detail (written by enrichSignupNotice). Lets the row
   *  render "Referred by <name>", linked to the referrer's own admin
   *  user-detail view. */
  invitedByUserId?: string | null;
  invitedByEmail?: string | null;
  invitedByName?: string | null;
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

  // Auth (must be first).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Site-admin check gates the admin operational feed. Fetched here (not in the
  // shared derivation) because only this session-scoped surface shows it.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isSiteAdmin = profile?.role === "admin";

  // All alert assembly lives in the shared derivation so the in-app bell and
  // the native-push badge count can never disagree. See src/lib/inbox/derive.ts.
  const res = await deriveInboxAlerts(supabase, user.id, { isSiteAdmin });
  if (!res.ok) return res;
  return { ok: true, alerts: res.alerts, isSiteAdmin };
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
