import type { SupabaseClient } from "@supabase/supabase-js";
import { expandRecurrence } from "@/lib/calendar/recurrence";
import type {
  AdminNoticeKind,
  InboxAlert,
  InboxAlertKind,
} from "@/app/actions/inbox";

/**
 * Inbox alert derivation — the single source of truth for "what's in a user's
 * inbox right now".
 *
 * This module is deliberately client-agnostic: it takes a Supabase client and a
 * user id rather than reading the session. Two callers share it:
 *
 *   1. `listInboxAlertsAction` (src/app/actions/inbox.ts) passes the request's
 *      RLS-scoped SSR client + the authed user — powering the in-app inbox bell
 *      and drawer.
 *   2. The native-push badge path (src/lib/notifications/*) passes a
 *      service-role client + an arbitrary recipient's id — so the iOS app-icon
 *      badge (`aps.badge`) and Android `notification_count` reflect the EXACT
 *      same count the user sees on the bell (including the admin operational
 *      feed for site admins), with no second, drift-prone counter.
 *
 * Every query below scopes explicitly (`.eq("user_id", …)`, `.in("playbook_id",
 * ownedIds)`, `.eq("recipient_user_id", …)`), so it returns identical rows under
 * the anon-key RLS client and the service-role client. RLS is defense-in-depth,
 * not the scoping mechanism — that's what lets the service-role badge path reuse
 * this untouched.
 */

/** Window for showing upcoming events without an RSVP. */
export const RSVP_LOOKAHEAD_DAYS = 14;

/** The pair of Supabase clients this module accepts. Both resolve to an
 *  untyped `SupabaseClient`; naming it keeps the call sites readable. */
type Client = SupabaseClient;

type BookMeta = { name: string; logo_url: string | null; color: string | null };

type PbJoinRow = {
  playbook_id: string;
  playbooks: BookMeta & { id: string } | (BookMeta & { id: string })[] | null;
};

function indexBooks(rows: PbJoinRow[]): Map<string, BookMeta> {
  const m = new Map<string, BookMeta>();
  for (const r of rows) {
    const b = Array.isArray(r.playbooks) ? r.playbooks[0] : r.playbooks;
    if (!b) continue;
    m.set(b.id, { name: b.name, logo_url: b.logo_url, color: b.color });
  }
  return m;
}

/** True for a coach-feedback admin notice — the alert treated as top priority +
 *  red across every inbox surface. Exported so the badge/urgency logic in
 *  inbox.ts stays in lockstep with the sort here. */
export function isFeedbackAlert(a: InboxAlert): boolean {
  return a.kind === "admin_notice" && a.adminKind === "feedback_received";
}

function stateOverlayKey(kind: InboxAlertKind, sourceId: string): string {
  return `${kind}::${sourceId}`;
}

async function loadInboxStateOverlay(
  client: Client,
  userId: string,
  alerts: InboxAlert[],
): Promise<Map<string, "archived" | "deleted">> {
  const out = new Map<string, "archived" | "deleted">();
  if (alerts.length === 0) return out;
  // RLS already restricts to auth.uid() on the SSR client, but pin the
  // user_id filter so the query plan can use the index even when the policy
  // compiles to a join — and so the service-role caller scopes correctly.
  const { data } = await client
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

async function buildAdminNoticeAlerts(client: Client): Promise<InboxAlert[]> {
  const { data, error } = await client
    .from("system_notices")
    .select(
      "id, kind, severity, user_id, user_display_name, user_email, body, href, detail, created_at",
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
    detail: Record<string, unknown> | null;
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
    invitedByUserId: (r.detail?.invited_by_user_id as string | null) ?? null,
    invitedByEmail: (r.detail?.invited_by_email as string | null) ?? null,
    invitedByName: (r.detail?.invited_by_name as string | null) ?? null,
  }));
}

function appendOwnerAlerts(
  alerts: InboxAlert[],
  bookById: Map<string, BookMeta>,
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
  client: Client,
  userId: string,
): Promise<InboxAlert[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await client
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
  bookById: Map<string, BookMeta>,
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

/**
 * Assemble every active/archived inbox alert for `userId`. Mirrors the phases
 * the in-app inbox has always run; extracted verbatim so the badge path and the
 * bell can never disagree. `isSiteAdmin` controls only the admin operational
 * feed (signups/purchases/etc.) — pass `false` from the badge path so the
 * app-icon count excludes site-admin notices (they're not coach-actionable).
 *
 * Returns alerts with their per-user state overlay applied (deleted rows
 * dropped; archived rows flagged) and sorted feedback-first, then newest-first.
 */
export async function deriveInboxAlerts(
  client: Client,
  userId: string,
  opts: { isSiteAdmin: boolean },
): Promise<
  { ok: true; alerts: InboxAlert[] } | { ok: false; error: string }
> {
  const [ownedRowsRes, memberRowsRes] = await Promise.all([
    client
      .from("playbook_members")
      .select("playbook_id, playbooks!inner(id, name, logo_url, color, is_archived)")
      .eq("user_id", userId)
      .eq("role", "owner")
      .eq("status", "active")
      .eq("playbooks.is_archived", false),
    client
      .from("playbook_members")
      .select("playbook_id, playbooks!inner(id, name, logo_url, color, is_archived)")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("playbooks.is_archived", false),
  ]);
  if (ownedRowsRes.error) return { ok: false, error: ownedRowsRes.error.message };
  if (memberRowsRes.error) return { ok: false, error: memberRowsRes.error.message };

  const ownerBookById = indexBooks(
    (ownedRowsRes.data ?? []) as unknown as PbJoinRow[],
  );
  const memberBookById = indexBooks(
    (memberRowsRes.data ?? []) as unknown as PbJoinRow[],
  );
  const ownedIds = Array.from(ownerBookById.keys());
  const memberIds = Array.from(memberBookById.keys());

  const now = new Date();
  const horizon = new Date(now.getTime() + RSVP_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  // For non-recurring events only load those that could still be upcoming.
  // Recurring events are always loaded regardless of starts_at because any
  // starts_at value may produce future occurrences via the rrule.
  const eventsCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [membersRes, claimsRes, eventsRes, shareAlerts, adminAlerts] =
    await Promise.all([
      ownedIds.length > 0
        ? client
            .from("playbook_members")
            .select(
              "playbook_id, user_id, role, status, created_at, coach_upgrade_requested_at, profiles:user_id(display_name)",
            )
            .in("playbook_id", ownedIds)
            .or("status.eq.pending,coach_upgrade_requested_at.not.is.null")
        : Promise.resolve({ data: [], error: null }),
      ownedIds.length > 0
        ? client
            .from("roster_claims")
            .select(
              "id, member_id, user_id, requested_at, note, member:member_id!inner(playbook_id, label, jersey_number, positions), profiles:user_id(display_name)",
            )
            .eq("status", "pending")
            .in("member.playbook_id", ownedIds)
        : Promise.resolve({ data: [], error: null }),
      memberIds.length > 0
        ? client
            .from("playbook_events")
            .select(
              "id, playbook_id, type, title, starts_at, recurrence_rule, recurrence_exdate, deleted_at",
            )
            .in("playbook_id", memberIds)
            .is("deleted_at", null)
            .or(`recurrence_rule.not.is.null,starts_at.gt.${eventsCutoff}`)
            .lt("starts_at", horizon.toISOString())
        : Promise.resolve({ data: [] as unknown[], error: null }),
      buildPendingCopySendAlerts(client, userId),
      opts.isSiteAdmin
        ? buildAdminNoticeAlerts(client)
        : Promise.resolve([] as InboxAlert[]),
    ]);

  if (membersRes.error) return { ok: false, error: membersRes.error.message };
  if (claimsRes.error) return { ok: false, error: claimsRes.error.message };
  if (eventsRes.error) return { ok: false, error: eventsRes.error.message };

  const eventIds = ((eventsRes.data ?? []) as { id: string }[]).map((e) => e.id);
  const existingRsvpsRes =
    eventIds.length > 0
      ? await client
          .from("playbook_event_rsvps")
          .select("event_id, occurrence_date")
          .eq("user_id", userId)
          .in("event_id", eventIds)
      : { data: [] as unknown[], error: null };

  const alerts: InboxAlert[] = [];
  appendOwnerAlerts(alerts, ownerBookById, membersRes.data, claimsRes.data);

  const responded = new Set(
    ((existingRsvpsRes.data ?? []) as { event_id: string; occurrence_date: string }[]).map(
      (r) => `${r.event_id}|${r.occurrence_date}`,
    ),
  );
  alerts.push(
    ...buildRsvpAlertsFromRows(
      (eventsRes.data ?? []) as RsvpEventRow[],
      responded,
      memberBookById,
      now,
      horizon,
    ),
  );

  alerts.push(...shareAlerts);
  alerts.push(...adminAlerts);

  // Per-user state overlay (archive / delete).
  const stateMap = await loadInboxStateOverlay(client, userId, alerts);
  const filtered: InboxAlert[] = [];
  for (const a of alerts) {
    const overlay = stateMap.get(stateOverlayKey(a.kind, a.sourceId));
    if (overlay === "deleted") continue;
    filtered.push({ ...a, status: overlay === "archived" ? "archived" : "active" });
  }

  // Coach feedback pins above everything; the rest stays newest-first.
  filtered.sort((a, b) => {
    const fb = (x: InboxAlert) => (isFeedbackAlert(x) ? 0 : 1);
    return fb(a) - fb(b) || b.createdAt.localeCompare(a.createdAt);
  });
  return { ok: true, alerts: filtered };
}

/**
 * The number rendered on the native app icon (`aps.badge` / Android
 * `notification_count`) for `userId`: the count of *active* inbox items —
 * exactly what the in-app inbox bell shows. For a site admin that includes the
 * admin operational feed (signups/purchases/etc.), matching the bell; a
 * non-admin never has those rows, so the flag is a no-op for them.
 *
 * Best-effort: returns `null` on any derivation error so the caller simply
 * omits the badge rather than failing the push. Never throws.
 */
export async function computeInboxBadgeCount(
  client: Client,
  userId: string,
): Promise<number | null> {
  try {
    // Determine site-admin status the same way listInboxAlertsAction does, so
    // the icon badge and the bell agree for admins too.
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const isSiteAdmin = (profile as { role?: string } | null)?.role === "admin";
    const res = await deriveInboxAlerts(client, userId, { isSiteAdmin });
    if (!res.ok) return null;
    return res.alerts.filter((a) => a.status === "active").length;
  } catch {
    return null;
  }
}
