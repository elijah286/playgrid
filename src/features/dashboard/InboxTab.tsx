"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Inbox,
  Megaphone,
  MoreHorizontal,
  Settings,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  approveCoachUpgradeAction,
  approveMemberAction,
  approveRosterClaimAction,
  denyCoachUpgradeAction,
  denyMemberAction,
  rejectRosterClaimAction,
} from "@/app/actions/playbook-roster";
import { bulkRsvpAction, setRsvpAction } from "@/app/actions/calendar";
import {
  archiveAlertAction,
  bulkArchiveAlertsAction,
  bulkDeleteAlertsAction,
  deleteAlertAction,
  listResolvedInboxEventsAction,
  unarchiveAlertAction,
  type AdminNoticeKind,
  type AlertRef,
  type InboxAlert,
  type InboxAlertKind,
  type ResolvedInboxEvent,
  type ResolvedKind,
} from "@/app/actions/inbox";
import type { ActivityEntry } from "@/app/actions/activity";
import {
  listDigestPlaybooksAction,
  updateDigestPrefsAction,
  type DigestPlaybookPref,
} from "@/app/actions/digest-prefs";
import { Button, Modal, SegmentedControl, useToast } from "@/components/ui";
import { useInboxBadge } from "@/features/dashboard/InboxBadgeContext";

type SortMode = "urgency" | "newest" | "oldest";
type FilterKind =
  | "all"
  | "billing"
  | "rsvp"
  | "roster"
  | "comments"
  | "shares"
  | "system";
/** Top-level inbox segment.
 *   - active   → not yet archived/deleted; what counts toward the badge
 *   - archived → user-dismissed but still recoverable
 *   - all      → active + archived (excludes deleted)
 *   - resolved → audit log of approvals/denials/RSVPs (different shape) */
type ViewMode = "active" | "archived" | "all" | "resolved";

function alertRef(a: InboxAlert): AlertRef {
  return { kind: a.kind, sourceId: a.sourceId };
}

/** Coach-feedback admin notice — top priority + red across every inbox
 *  surface. Mirrors isFeedbackAlert in src/app/actions/inbox.ts (kept local
 *  because that module is "use server" and can't export sync helpers). */
function isFeedbackAlert(a: InboxAlert): boolean {
  return a.kind === "admin_notice" && a.adminKind === "feedback_received";
}

/** Lower bucket = more urgent. Drives default sort and the inbox tab's red badge. */
function urgencyBucket(a: InboxAlert): number {
  // Coach feedback outranks everything — even critical alerts — so it sits at
  // the very top of the default sort.
  if (isFeedbackAlert(a)) return -1;
  if (a.kind === "system_alert") {
    return a.severity === "critical" ? 0 : a.severity === "warn" ? 1 : 4;
  }
  if (a.kind === "rsvp_pending") {
    const startsAt = a.eventStartsAt ? Date.parse(a.eventStartsAt) : NaN;
    const soon =
      Number.isFinite(startsAt) && startsAt - Date.now() < 24 * 60 * 60 * 1000;
    return soon ? 2 : 3;
  }
  if (
    a.kind === "membership" ||
    a.kind === "coach_upgrade" ||
    a.kind === "roster_claim"
  ) {
    return 5;
  }
  if (a.kind === "mention") return 6;
  // Admin system notices are informational and shouldn't drive the red
  // badge — drop them to the bottom of the urgency sort.
  if (a.kind === "admin_notice") return 8;
  return 7; // share + anything else
}

function alertSortKey(a: InboxAlert): string {
  // RSVPs sort by event time ascending; everything else by createdAt descending.
  if (a.kind === "rsvp_pending" && a.eventStartsAt) return a.eventStartsAt;
  return a.createdAt;
}

function matchesFilter(a: InboxAlert, f: FilterKind): boolean {
  if (f === "all") return true;
  if (f === "billing") return a.kind === "system_alert";
  if (f === "rsvp") return a.kind === "rsvp_pending";
  if (f === "roster")
    return (
      a.kind === "membership" ||
      a.kind === "coach_upgrade" ||
      a.kind === "roster_claim"
    );
  if (f === "comments") return a.kind === "mention";
  if (f === "shares") return a.kind === "share";
  if (f === "system") return a.kind === "admin_notice";
  return false;
}

const ADMIN_SYSTEM_NOTICES_KEY = "inbox.showAdminNotices";
/** Per-browser read tracking. We keep it client-side for now — adding a
 *  DB column for read_at would also work but cross-device sync isn't
 *  worth the migration churn at this stage. The set is keyed by
 *  InboxAlert.key (already stable across reloads). Old keys leak
 *  forever; the LRU cap keeps the set bounded so localStorage doesn't
 *  grow unbounded. */
const READ_KEYS_KEY = "inbox.readKeys";
const READ_KEYS_MAX = 500;

function loadReadKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(READ_KEYS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}
function saveReadKeys(keys: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = keys.length > READ_KEYS_MAX ? keys.slice(-READ_KEYS_MAX) : keys;
    window.localStorage.setItem(READ_KEYS_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / private mode — fine to drop */
  }
}

export function InboxTab({
  initialAlerts,
  initialActivity = [],
  isSiteAdmin = false,
}: {
  initialAlerts: InboxAlert[];
  initialActivity?: ActivityEntry[];
  /** When true, render the "View system notices" checkbox and surface
   *  admin_notice rows. Server-side flag — clients can't promote. */
  isSiteAdmin?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { resolveOptimistically, reviveOptimistically } = useInboxBadge();
  const [alerts, setAlerts] = useState<InboxAlert[]>(initialAlerts);
  const [busy, setBusy] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("urgency");
  const [filter, setFilter] = useState<FilterKind>("all");
  // Playbook scope filter — null means "all playbooks". Stored as the
  // playbook id to keep semantics stable across renames.
  const [playbookFilter, setPlaybookFilter] = useState<string | null>(null);
  // Read-state filter — composes with kind + playbook. "all" = no filter,
  // "unread" = only items not yet opened, "read" = only items already
  // viewed via the detail panel.
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [view, setView] = useState<ViewMode>("active");
  const [resolved, setResolved] = useState<ResolvedInboxEvent[] | null>(null);
  const [resolvedLoading, setResolvedLoading] = useState(false);
  const [showRsvps, setShowRsvps] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Multi-select for bulk archive / delete / RSVP. Mirrors the Plays
  // grid pattern: tap "Select" → checkboxes appear → bulk-action bar
  // shows over the list. Cancel exits without applying anything.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  // Detail-panel preview. Clicking a row in non-select mode opens this
  // alert's summary inline so the user can scan it without paying the
  // navigation cost; the panel itself surfaces the deep link.
  const [previewAlert, setPreviewAlert] = useState<InboxAlert | null>(null);
  // Email-style read tracking. Persisted locally only (see READ_KEYS_KEY).
  // Hydrate from localStorage post-mount to avoid SSR/CSR mismatch on
  // bold-vs-muted row styling.
  const [readKeys, setReadKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage
    setReadKeys(new Set(loadReadKeys()));
  }, []);
  // Debounced toast: collapses rapid successive same-action confirmations
  // into a single counted toast ("Archived" → "Archived (3)" → "Archived (10)")
  // so the user doesn't get a wall of duplicate toasts when they
  // rapid-fire the icon. Per-label counters + timers so different actions
  // (Archived, Deleted, Restored) don't share a count.
  const toastCountsRef = useRef<Map<string, number>>(new Map());
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const flashToast = (label: string) => {
    const counts = toastCountsRef.current;
    const timers = toastTimersRef.current;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    const existing = timers.get(label);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      const n = counts.get(label) ?? 0;
      counts.delete(label);
      timers.delete(label);
      toast(n === 1 ? label : `${label} (${n})`, "success");
    }, 600);
    timers.set(label, t);
  };
  const markAsRead = (key: string) => {
    setReadKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      saveReadKeys([...next]);
      return next;
    });
  };
  const markAsUnread = (key: string) => {
    setReadKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      saveReadKeys([...next]);
      return next;
    });
  };
  const toggleReadByKey = (alert: InboxAlert) => {
    if (readKeys.has(alert.key)) {
      markAsUnread(alert.key);
      flashToast("Marked unread");
    } else {
      markAsRead(alert.key);
      flashToast("Marked read");
    }
  };
  const openPreview = (alert: InboxAlert) => {
    setPreviewAlert(alert);
    markAsRead(alert.key);
  };
  // Admin-only: "View system notices" checkbox state. Default ON;
  // persisted in localStorage so the choice sticks across reloads.
  const [showAdminNotices, setShowAdminNotices] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(ADMIN_SYSTEM_NOTICES_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted preference
      if (v === "0") setShowAdminNotices(false);
    } catch {}
  }, []);
  const updateShowAdminNotices = (v: boolean) => {
    setShowAdminNotices(v);
    try {
      window.localStorage.setItem(ADMIN_SYSTEM_NOTICES_KEY, v ? "1" : "0");
    } catch {}
  };
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("settings") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep-link from email
      setSettingsOpen(true);
    }
  }, []);

  // Lazy-load the resolved audit log for both the dedicated Resolved
  // segment AND the All view (which interleaves active/archived alerts
  // with resolved history so a coach can see what they've already
  // RSVP'd to or approved without flipping segments).
  useEffect(() => {
    const needsResolved = view === "resolved" || view === "all";
    if (!needsResolved || resolved !== null) return;
    let cancelled = false;
    setResolvedLoading(true);
    listResolvedInboxEventsAction()
      .then((res) => {
        if (cancelled) return;
        setResolved(res.ok ? res.events : []);
        if (!res.ok) toast(res.error, "error");
      })
      .finally(() => {
        if (!cancelled) setResolvedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, resolved, toast]);

  // Switching views or leaving select mode clears any pending selection
  // so the bulk action bar doesn't carry over rows that are no longer
  // visible.
  useEffect(() => {
    setSelectedKeys(new Set());
  }, [view, selectMode]);

  // Apply the admin "view system notices" toggle before any other
  // counting/filtering: when off, admin_notice rows are invisible
  // everywhere (counts, filters, urgency badge).
  const adminFilteredAlerts = useMemo(() => {
    if (isSiteAdmin && !showAdminNotices) {
      // Feedback is never hidden by the system-notices toggle — it's the
      // highest-signal alert and must always be visible.
      return alerts.filter((a) => a.kind !== "admin_notice" || isFeedbackAlert(a));
    }
    return alerts;
  }, [alerts, isSiteAdmin, showAdminNotices]);

  // Active = the items the user hasn't dismissed yet. Drives the badge,
  // the "Active" view, and the empty-state copy. Archived/all view their
  // own scoped slices below.
  const activeAlerts = useMemo(
    () => adminFilteredAlerts.filter((a) => a.status === "active"),
    [adminFilteredAlerts],
  );
  const archivedAlerts = useMemo(
    () => adminFilteredAlerts.filter((a) => a.status === "archived"),
    [adminFilteredAlerts],
  );

  // Pick the slice that drives the current view.
  const viewAlerts = useMemo(() => {
    if (view === "archived") return archivedAlerts;
    if (view === "all") return adminFilteredAlerts;
    return activeAlerts;
  }, [view, adminFilteredAlerts, activeAlerts, archivedAlerts]);

  // Filter chip counts always reflect the *active* view, so the chips
  // act as a triage tool ("how many things still need me?") regardless
  // of which segment is open.
  const counts = useMemo(() => {
    const c = {
      all: 0,
      billing: 0,
      rsvp: 0,
      roster: 0,
      comments: 0,
      shares: 0,
      system: 0,
    };
    for (const a of activeAlerts) {
      c.all += 1;
      if (a.kind === "system_alert") c.billing += 1;
      else if (a.kind === "rsvp_pending") c.rsvp += 1;
      else if (
        a.kind === "membership" ||
        a.kind === "coach_upgrade" ||
        a.kind === "roster_claim"
      )
        c.roster += 1;
      else if (a.kind === "mention") c.comments += 1;
      else if (a.kind === "share") c.shares += 1;
      else if (a.kind === "admin_notice") c.system += 1;
    }
    return c;
  }, [activeAlerts]);

  // Read/unread counts within the current view, scoped to the active
  // kind + playbook filters. The dropdown surfaces both numbers so a
  // user knows "I have 12 unread out of 87 across this view" before
  // committing to the filter.
  const readCounts = useMemo(() => {
    let unread = 0;
    let read = 0;
    for (const a of viewAlerts) {
      if (!matchesFilter(a, filter)) continue;
      if (playbookFilter != null) {
        const id = a.playbookId || "__site__";
        if (id !== playbookFilter) continue;
      }
      if (readKeys.has(a.key)) read++;
      else unread++;
    }
    return { all: unread + read, unread, read };
  }, [viewAlerts, filter, playbookFilter, readKeys]);

  // Number of distinct alert-kinds present in the active slice. Used to
  // decide whether the Kind filter dropdown is even worth rendering (a
  // user with only system notices doesn't need a "filter by kind"
  // option that has only one real choice).
  const kindOptionsCount = useMemo(() => {
    let n = 0;
    if (counts.billing > 0) n++;
    if (counts.rsvp > 0) n++;
    if (counts.roster > 0) n++;
    if (counts.comments > 0) n++;
    if (counts.shares > 0) n++;
    if (counts.system > 0) n++;
    return n;
  }, [counts]);

  // Set of playbooks present in the active+archived slice — used by the
  // playbook filter dropdown. Admin notices have an empty playbookId, so
  // we synthesise a "Site" entry for them.
  const playbookOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; color: string | null; logoUrl: string | null; count: number }
    >();
    for (const a of adminFilteredAlerts) {
      const id = a.playbookId || "__site__";
      const existing = map.get(id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(id, {
          id,
          name: a.playbookName,
          color: a.playbookColor,
          logoUrl: a.playbookLogoUrl,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [adminFilteredAlerts]);

  const visible = useMemo(() => {
    const filtered = viewAlerts.filter((a) => {
      if (!matchesFilter(a, filter)) return false;
      if (playbookFilter != null) {
        const id = a.playbookId || "__site__";
        if (id !== playbookFilter) return false;
      }
      if (readFilter !== "all") {
        const isUnread = !readKeys.has(a.key);
        if (readFilter === "unread" && !isUnread) return false;
        if (readFilter === "read" && isUnread) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    if (sort === "urgency") {
      sorted.sort((a, b) => {
        const bucketDiff = urgencyBucket(a) - urgencyBucket(b);
        if (bucketDiff !== 0) return bucketDiff;
        // Within bucket: RSVPs ascending by event time, everything else newest first.
        if (a.kind === "rsvp_pending" && b.kind === "rsvp_pending") {
          return alertSortKey(a).localeCompare(alertSortKey(b));
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
    } else if (sort === "newest") {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else {
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return sorted;
  }, [viewAlerts, sort, filter, playbookFilter, readFilter, readKeys]);

  function removeByKey(key: string) {
    setAlerts((prev) => prev.filter((a) => a.key !== key));
  }

  function setStatusByKey(key: string, status: InboxAlert["status"]) {
    setAlerts((prev) =>
      prev.map((a) => (a.key === key ? { ...a, status } : a)),
    );
  }

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedKeys(new Set(visible.map((a) => a.key)));
  }
  function clearSelection() {
    setSelectedKeys(new Set());
  }

  // Items are only RSVP-able if every selected row is an RSVP_pending.
  // Used to enable/disable the bulk RSVP buttons in the action bar.
  const selectedAlerts = useMemo(
    () => visible.filter((a) => selectedKeys.has(a.key)),
    [visible, selectedKeys],
  );
  const allSelectedAreRsvp =
    selectedAlerts.length > 0 &&
    selectedAlerts.every((a) => a.kind === "rsvp_pending");

  function actArchive(alert: InboxAlert) {
    const busyKey = `arch:${alert.key}`;
    setBusy(busyKey);
    // Optimistic: flip immediately. Roll back if the server rejects.
    setStatusByKey(alert.key, "archived");
    const wasActive = alert.status === "active";
    if (wasActive) resolveOptimistically(alert.key);
    startTransition(async () => {
      try {
        const res = await archiveAlertAction(alertRef(alert));
        if (!res.ok) {
          setStatusByKey(alert.key, "active");
          if (wasActive) reviveOptimistically(alert.key);
          toast(res.error, "error");
          return;
        }
        flashToast("Archived");
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  function actDelete(alert: InboxAlert) {
    const busyKey = `del:${alert.key}`;
    setBusy(busyKey);
    // Optimistic remove. If the server fails, the next router.refresh()
    // (or a manual reload) will resurrect the row.
    removeByKey(alert.key);
    const wasActive = alert.status === "active";
    if (wasActive) resolveOptimistically(alert.key);
    startTransition(async () => {
      try {
        const res = await deleteAlertAction(alertRef(alert));
        if (!res.ok) {
          if (wasActive) reviveOptimistically(alert.key);
          toast(res.error, "error");
          router.refresh();
          return;
        }
        flashToast("Deleted");
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  function actUnarchive(alert: InboxAlert) {
    const busyKey = `unarch:${alert.key}`;
    setBusy(busyKey);
    setStatusByKey(alert.key, "active");
    // Unarchive bumps the active count by one. The badge picks that up
    // on the next router.refresh() — we don't optimistically increment
    // because we don't track which keys have been "revived from archive."
    startTransition(async () => {
      try {
        const res = await unarchiveAlertAction(alertRef(alert));
        if (!res.ok) {
          setStatusByKey(alert.key, "archived");
          toast(res.error, "error");
          return;
        }
        flashToast("Restored");
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  function bulkArchive() {
    const refs = selectedAlerts.map(alertRef);
    if (refs.length === 0) return;
    const keys = selectedAlerts.map((a) => a.key);
    const previouslyActiveKeys = selectedAlerts
      .filter((a) => a.status === "active")
      .map((a) => a.key);
    setBusy("bulk:arch");
    setAlerts((prev) =>
      prev.map((a) =>
        keys.includes(a.key) ? { ...a, status: "archived" } : a,
      ),
    );
    for (const k of previouslyActiveKeys) resolveOptimistically(k);
    clearSelection();
    setSelectMode(false);
    startTransition(async () => {
      try {
        const res = await bulkArchiveAlertsAction(refs);
        if (!res.ok) {
          for (const k of previouslyActiveKeys) reviveOptimistically(k);
          toast(res.error, "error");
          router.refresh();
          return;
        }
        toast(`Archived ${refs.length}`, "success");
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  function bulkDelete() {
    const refs = selectedAlerts.map(alertRef);
    if (refs.length === 0) return;
    const keys = new Set(selectedAlerts.map((a) => a.key));
    const previouslyActiveKeys = selectedAlerts
      .filter((a) => a.status === "active")
      .map((a) => a.key);
    setBusy("bulk:del");
    setAlerts((prev) => prev.filter((a) => !keys.has(a.key)));
    for (const k of previouslyActiveKeys) resolveOptimistically(k);
    clearSelection();
    setSelectMode(false);
    startTransition(async () => {
      try {
        const res = await bulkDeleteAlertsAction(refs);
        if (!res.ok) {
          for (const k of previouslyActiveKeys) reviveOptimistically(k);
          toast(res.error, "error");
          router.refresh();
          return;
        }
        toast(`Deleted ${refs.length}`, "success");
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  function bulkRsvp(status: "yes" | "maybe" | "no") {
    const events = selectedAlerts
      .filter((a) => a.kind === "rsvp_pending" && a.eventId && a.occurrenceDate)
      .map((a) => ({
        eventId: a.eventId as string,
        occurrenceDate: a.occurrenceDate as string,
      }));
    if (events.length === 0) return;
    const keys = new Set(selectedAlerts.map((a) => a.key));
    const previouslyActiveKeys = selectedAlerts
      .filter((a) => a.status === "active")
      .map((a) => a.key);
    setBusy("bulk:rsvp");
    // Optimistic remove: an RSVP'd event no longer needs your attention.
    setAlerts((prev) => prev.filter((a) => !keys.has(a.key)));
    for (const k of previouslyActiveKeys) resolveOptimistically(k);
    clearSelection();
    setSelectMode(false);
    startTransition(async () => {
      try {
        const res = await bulkRsvpAction(events, status);
        if (!res.ok) {
          for (const k of previouslyActiveKeys) reviveOptimistically(k);
          toast(`${res.error} (${res.applied}/${events.length} applied)`, "error");
          router.refresh();
          return;
        }
        toast(
          `RSVP'd ${labelForRsvp(status)} to ${res.applied} event${res.applied === 1 ? "" : "s"}`,
          "success",
        );
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  function actRsvp(
    alert: InboxAlert,
    status: "yes" | "no" | "maybe",
  ) {
    const eventId = alert.eventId;
    const occurrenceDate = alert.occurrenceDate;
    if (!eventId || !occurrenceDate) return;
    const busyKey = `rsvp:${status}:${alert.key}`;
    setBusy(busyKey);
    const wasActive = alert.status === "active";
    if (wasActive) resolveOptimistically(alert.key);
    startTransition(async () => {
      try {
        const res = await setRsvpAction({
          eventId,
          occurrenceDate,
          status,
          note: null,
        });
        if (!res.ok) {
          if (wasActive) reviveOptimistically(alert.key);
          toast(res.error, "error");
          return;
        }
        removeByKey(alert.key);
        toast(`RSVP'd ${labelForRsvp(status)}`, "success");
        router.refresh();
      } catch (e) {
        if (wasActive) reviveOptimistically(alert.key);
        toast(e instanceof Error ? e.message : "Something went wrong.", "error");
      } finally {
        setBusy(null);
      }
    });
  }

  function act(
    alert: InboxAlert,
    op: "approve" | "reject",
    busyKey: string,
    okMsg: string,
  ) {
    setBusy(busyKey);
    const wasActive = alert.status === "active";
    if (wasActive) resolveOptimistically(alert.key);
    startTransition(async () => {
      try {
        let res: { ok: true } | { ok: false; error: string };
        if (alert.kind === "roster_claim" && alert.claimId) {
          res =
            op === "approve"
              ? await approveRosterClaimAction(alert.playbookId, alert.claimId)
              : await rejectRosterClaimAction(alert.playbookId, alert.claimId);
        } else if (alert.kind === "coach_upgrade" && alert.userId) {
          res =
            op === "approve"
              ? await approveCoachUpgradeAction(alert.playbookId, alert.userId)
              : await denyCoachUpgradeAction(alert.playbookId, alert.userId);
        } else if (alert.kind === "membership" && alert.userId) {
          res =
            op === "approve"
              ? await approveMemberAction(alert.playbookId, alert.userId)
              : await denyMemberAction(alert.playbookId, alert.userId);
        } else {
          res = { ok: false, error: "Unknown alert" };
        }
        if (!res.ok) {
          if (wasActive) reviveOptimistically(alert.key);
          toast(res.error, "error");
          return;
        }
        removeByKey(alert.key);
        toast(okMsg, "success");
        router.refresh();
      } catch (e) {
        if (wasActive) reviveOptimistically(alert.key);
        toast(e instanceof Error ? e.message : "Something went wrong.", "error");
      } finally {
        setBusy(null);
      }
    });
  }

  // Heading + subhead vary per view. Active is the default action-driven
  // copy; Archived/All are scoped to themselves; Resolved is the historical
  // audit log so it gets its own framing.
  return (
    <div className="space-y-3">
      {/* Inbox header — title + subtitle on the left, view-agnostic
          controls on the right. Sort / email settings / admin toggle
          live in the overflow menu so the bar stays uncluttered on
          phone width. The Active|Archived|All|Resolved segmented
          control sits below as its own row, full-width on mobile. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground sm:text-xl">Inbox</h2>
          <p className="text-xs text-muted sm:text-sm">
            A summary of all updates and changes across your playbooks.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {view !== "resolved" && (
            <button
              type="button"
              onClick={() => {
                setSelectMode((s) => !s);
                clearSelection();
              }}
              disabled={!selectMode && visible.length === 0}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                selectMode
                  ? "bg-primary text-white hover:bg-primary-hover"
                  : "text-muted hover:bg-surface-inset hover:text-foreground"
              }`}
            >
              {selectMode ? "Done" : "Edit"}
            </button>
          )}
          <InboxOverflowMenu
            sort={sort}
            onSortChange={setSort}
            onOpenEmailSettings={() => setSettingsOpen(true)}
            isSiteAdmin={isSiteAdmin}
            showAdminNotices={showAdminNotices}
            onToggleAdminNotices={() =>
              updateShowAdminNotices(!showAdminNotices)
            }
          />
        </div>
      </div>

      <SegmentedControl<ViewMode>
        size="sm"
        value={view}
        onChange={(v) => {
          setView(v);
          setSelectMode(false);
        }}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
          { value: "all", label: "All" },
          { value: "resolved", label: "Resolved" },
        ]}
      />

      {view !== "resolved" ? (
        viewAlerts.length === 0 &&
        !(view === "all" && (resolved?.length ?? 0) > 0) ? (
          <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center">
            <Inbox className="mx-auto size-8 text-muted" />
            <h2 className="mt-3 text-base font-bold text-foreground">
              {view === "archived"
                ? "Nothing archived"
                : view === "all"
                  ? "Inbox is empty"
                  : "You're all caught up"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {view === "archived"
                ? "Items you archive from Active will show up here. Restore or delete from this view."
                : view === "all"
                  ? "No active or archived items right now."
                  : "Nothing waiting on you right now. Upcoming events that need an RSVP, roster claims, and join requests will show up here."}
            </p>
          </div>
        ) : (
          <>
            {viewAlerts.length > 0 &&
              (kindOptionsCount > 1 ||
                playbookOptions.length > 1 ||
                readCounts.unread > 0) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Read state — single binary toggle pill (Gmail's
                      "Unread" pattern). Hidden when there are no unread
                      to filter. Click to flip; the count is always
                      visible so the user knows the impact. */}
                  {readCounts.unread > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setReadFilter((r) => (r === "unread" ? "all" : "unread"))
                      }
                      aria-pressed={readFilter === "unread"}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        readFilter === "unread"
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-surface-raised text-foreground hover:border-primary/50"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          readFilter === "unread" ? "bg-white" : "bg-primary"
                        }`}
                      />
                      Unread only
                      <span
                        className={
                          readFilter === "unread"
                            ? "text-white/80"
                            : "text-muted"
                        }
                      >
                        ({readCounts.unread})
                      </span>
                    </button>
                  )}
                  {kindOptionsCount > 1 && (
                    <FilterDropdown<FilterKind>
                      label="Kind"
                      value={filter}
                      onChange={setFilter}
                      options={[
                        { value: "all", label: "All", count: counts.all },
                        ...(counts.billing > 0 ? [{ value: "billing" as FilterKind, label: "Billing", count: counts.billing }] : []),
                        ...(counts.rsvp > 0 ? [{ value: "rsvp" as FilterKind, label: "Calendar / RSVPs", count: counts.rsvp }] : []),
                        ...(counts.roster > 0 ? [{ value: "roster" as FilterKind, label: "Roster", count: counts.roster }] : []),
                        ...(counts.comments > 0 ? [{ value: "comments" as FilterKind, label: "Comments", count: counts.comments }] : []),
                        ...(counts.shares > 0 ? [{ value: "shares" as FilterKind, label: "Shares", count: counts.shares }] : []),
                        ...(counts.system > 0 ? [{ value: "system" as FilterKind, label: "System", count: counts.system }] : []),
                      ]}
                    />
                  )}
                  {playbookOptions.length > 1 && (
                    <FilterDropdown<string | null>
                      label="Playbook"
                      value={playbookFilter}
                      onChange={setPlaybookFilter}
                      options={[
                        { value: null, label: "All playbooks", count: adminFilteredAlerts.length },
                        ...playbookOptions.map((p) => ({
                          value: p.id,
                          label: p.name,
                          count: p.count,
                        })),
                      ]}
                    />
                  )}
                  {(filter !== "all" ||
                    playbookFilter != null ||
                    readFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilter("all");
                        setPlaybookFilter(null);
                        setReadFilter("all");
                      }}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-inset hover:text-foreground"
                    >
                      <X className="size-3" />
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            {selectMode && (
              <BulkActionBar
                selectedCount={selectedKeys.size}
                visibleCount={visible.length}
                allRsvp={allSelectedAreRsvp}
                view={view}
                busy={busy?.startsWith("bulk:") ?? false}
                onSelectAll={selectAllVisible}
                onClear={clearSelection}
                onArchive={bulkArchive}
                onDelete={bulkDelete}
                onRsvp={bulkRsvp}
              />
            )}
            {viewAlerts.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {visible.map((alert) => (
                <AlertRow
                  key={alert.key}
                  alert={alert}
                  busy={busy}
                  unread={!readKeys.has(alert.key)}
                  onAct={act}
                  onRsvp={actRsvp}
                  selectMode={selectMode}
                  selected={selectedKeys.has(alert.key)}
                  onToggleSelect={() => toggleSelected(alert.key)}
                  onArchive={actArchive}
                  onDelete={actDelete}
                  onUnarchive={actUnarchive}
                  onPreview={openPreview}
                  onToggleRead={toggleReadByKey}
                />
              ))}
            </ul>
            )}
            {view === "all" && (resolved?.length ?? 0) > 0 && (
              <div className="space-y-2 pt-1">
                <div className="px-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Recently resolved
                  </h3>
                  <p className="text-xs text-muted">
                    Things you&apos;ve already RSVP&apos;d to, approved, or denied.
                  </p>
                </div>
                <ResolvedList
                  loading={resolvedLoading}
                  events={resolved ?? []}
                  showRsvps={showRsvps}
                  onToggleRsvps={() => setShowRsvps((v) => !v)}
                />
              </div>
            )}
          </>
        )
      ) : (
        <ResolvedList
          loading={resolvedLoading}
          events={resolved ?? []}
          showRsvps={showRsvps}
          onToggleRsvps={() => setShowRsvps((v) => !v)}
        />
      )}

      {view === "active" && initialActivity.length > 0 && (
        <RecentActivity entries={initialActivity} />
      )}

      {settingsOpen && (
        <DigestSettingsModal onClose={() => setSettingsOpen(false)} />
      )}

      {previewAlert && (
        <InboxDetailPanel
          alert={previewAlert}
          busy={busy}
          onClose={() => setPreviewAlert(null)}
          onArchive={(a) => {
            actArchive(a);
            setPreviewAlert(null);
          }}
          onDelete={(a) => {
            actDelete(a);
            setPreviewAlert(null);
          }}
          onUnarchive={(a) => {
            actUnarchive(a);
            setPreviewAlert(null);
          }}
          onAct={(a, op, busyKey, okMsg) => {
            act(a, op, busyKey, okMsg);
            setPreviewAlert(null);
          }}
          onRsvp={(a, status) => {
            actRsvp(a, status);
            setPreviewAlert(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Compact filter dropdown — single-select radio with a label and a
 * trigger that shows the active option. Generic over T so the same
 * component drives both Kind (FilterKind) and Playbook (string | null).
 * Shrinks to fit on mobile; popover anchors right-aligned to the trigger.
 */
function FilterDropdown<T>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const active = options.find((o) => valueEquals(o.value, value));
  const isDefault = options[0] && valueEquals(active?.value, options[0].value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
          isDefault
            ? "border-border bg-surface-raised text-muted hover:border-primary/50 hover:text-foreground"
            : "border-primary/40 bg-primary/5 text-primary"
        }`}
      >
        <span className="text-muted">{label}:</span>
        <span className="font-semibold">{active?.label ?? "All"}</span>
        <ChevronDown className="size-3 shrink-0 opacity-70" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-border bg-surface-raised py-1 shadow-elevated"
        >
          {options.map((opt, i) => {
            const isActive = valueEquals(opt.value, value);
            return (
              <button
                key={`${i}:${String(opt.value)}`}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-inset ${
                  isActive ? "text-primary" : "text-foreground"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {opt.count != null && (
                    <span className="text-xs text-muted">{opt.count}</span>
                  )}
                  {isActive && <Check className="size-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
function valueEquals<T>(a: T | undefined, b: T): boolean {
  return a === b;
}

/**
 * Compact overflow menu (kebab) for inbox header settings. Contains:
 *   - Sort by urgency / newest / oldest (radio-like, single select)
 *   - Email settings (opens digest preferences modal)
 *   - View system notices (admin only, toggle)
 * Click outside or on a menu item to close. Implemented inline (no extra
 * popover lib) — matches the pattern used elsewhere in the codebase.
 */
function InboxOverflowMenu({
  sort,
  onSortChange,
  onOpenEmailSettings,
  isSiteAdmin,
  showAdminNotices,
  onToggleAdminNotices,
}: {
  sort: SortMode;
  onSortChange: (s: SortMode) => void;
  onOpenEmailSettings: () => void;
  isSiteAdmin: boolean;
  showAdminNotices: boolean;
  onToggleAdminNotices: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sortLabel: Record<SortMode, string> = {
    urgency: "Urgency",
    newest: "Newest first",
    oldest: "Oldest first",
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Inbox options"
        className="inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-elevated"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Sort
          </div>
          {(["urgency", "newest", "oldest"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={sort === s}
              onClick={() => {
                onSortChange(s);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground hover:bg-surface-inset"
            >
              {sortLabel[s]}
              {sort === s && <Check className="size-3.5 text-primary" />}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenEmailSettings();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-inset"
          >
            <Settings className="size-3.5 text-muted" />
            Email settings
          </button>
          {isSiteAdmin && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={showAdminNotices}
                onClick={() => {
                  onToggleAdminNotices();
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-inset"
              >
                <span className="flex items-center gap-2">
                  <Megaphone className="size-3.5 text-muted" />
                  View system notices
                </span>
                <span
                  className={`inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    showAdminNotices ? "bg-primary" : "bg-border"
                  }`}
                >
                  <span
                    className={`block size-3 rounded-full bg-white shadow transition-transform ${
                      showAdminNotices ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Sticky-ish toolbar that appears above the alert list while the user is
 * in multi-select mode. Surfaces bulk Archive / Delete (always) and bulk
 * RSVP yes/maybe/no (only when every selected row is rsvp_pending —
 * RSVP'ing to a non-event row is meaningless). Restore replaces Archive
 * when the user is on the Archived view.
 */
function BulkActionBar({
  selectedCount,
  visibleCount,
  allRsvp,
  view,
  busy,
  onSelectAll,
  onClear,
  onArchive,
  onDelete,
  onRsvp,
}: {
  selectedCount: number;
  visibleCount: number;
  allRsvp: boolean;
  view: ViewMode;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRsvp: (status: "yes" | "maybe" | "no") => void;
}) {
  const noneSelected = selectedCount === 0;
  const allSelected = selectedCount > 0 && selectedCount === visibleCount;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/[0.04] px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          onClick={allSelected ? onClear : onSelectAll}
          className="font-medium text-primary hover:underline"
        >
          {allSelected ? "Clear" : `Select all (${visibleCount})`}
        </button>
        <span className="text-muted">
          {noneSelected
            ? "Pick items to act on."
            : `${selectedCount} selected`}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {allRsvp && (
          <>
            <button
              type="button"
              disabled={busy || noneSelected}
              onClick={() => onRsvp("yes")}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="size-3.5" />
              Going
            </button>
            <button
              type="button"
              disabled={busy || noneSelected}
              onClick={() => onRsvp("maybe")}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Maybe
            </button>
            <button
              type="button"
              disabled={busy || noneSelected}
              onClick={() => onRsvp("no")}
              className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="size-3.5" />
              Can&apos;t go
            </button>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          </>
        )}
        {view !== "archived" && (
          <button
            type="button"
            disabled={busy || noneSelected}
            onClick={onArchive}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-surface-inset disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Archive className="size-3.5" />
            Archive
          </button>
        )}
        <button
          type="button"
          disabled={busy || noneSelected}
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * Lightweight detail panel for the clicked inbox row. Renders inside a
 * Modal so it works on any viewport (sheet-like on mobile, centered on
 * desktop). Content is per-kind: calendar event details, comment snippet,
 * roster request body, system-notice body, etc. Actions hoist the same
 * handlers the row itself wires (RSVP, approve/deny, archive, delete) so
 * the user can dispose of the alert without leaving the panel. The
 * "View in <context>" link routes to the deep page when they want more.
 */
function InboxDetailPanel({
  alert,
  busy,
  onClose,
  onArchive,
  onDelete,
  onUnarchive,
  onAct,
  onRsvp,
}: {
  alert: InboxAlert;
  busy: string | null;
  onClose: () => void;
  onArchive: (a: InboxAlert) => void;
  onDelete: (a: InboxAlert) => void;
  onUnarchive: (a: InboxAlert) => void;
  onAct: (
    a: InboxAlert,
    op: "approve" | "reject",
    busyKey: string,
    okMsg: string,
  ) => void;
  onRsvp: (a: InboxAlert, status: "yes" | "no" | "maybe") => void;
}) {
  const isArchived = alert.status === "archived";
  const { title, body, ctaHref, ctaLabel, content, primaryActions } =
    detailFor(alert, onAct, onRsvp, busy);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {isArchived ? (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={ArchiveRestore}
                disabled={busy !== null}
                onClick={() => onUnarchive(alert)}
              >
                Restore
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={Archive}
                disabled={busy !== null}
                onClick={() => onArchive(alert)}
              >
                Archive
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              leftIcon={Trash2}
              disabled={busy !== null}
              onClick={() => onDelete(alert)}
            >
              Delete
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            {primaryActions}
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
              onClick={onClose}
            >
              {ctaLabel}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <PlaybookAvatar
            name={alert.playbookName}
            logoUrl={alert.playbookLogoUrl}
            color={alert.playbookColor}
            size="sm"
          />
          <span className="font-semibold text-foreground">
            {alert.playbookName}
          </span>
          <span aria-hidden>·</span>
          <KindBadge kind={alert.kind} adminKind={alert.adminKind} />
          <span aria-hidden>·</span>
          <span>{timeAgo(alert.createdAt)}</span>
        </div>
        {body && <p className="text-sm text-foreground">{body}</p>}
        {content}
      </div>
    </Modal>
  );
}

/** Resolve the per-kind content for the detail panel: titles, body copy,
 *  CTA target, and any kind-specific extras (event time, severity badge,
 *  inline approve/deny or RSVP buttons). Centralised so the panel itself
 *  stays presentation-only. */
function detailFor(
  alert: InboxAlert,
  onAct: (
    a: InboxAlert,
    op: "approve" | "reject",
    busyKey: string,
    okMsg: string,
  ) => void,
  onRsvp: (a: InboxAlert, status: "yes" | "no" | "maybe") => void,
  busy: string | null,
): {
  title: string;
  body: string | null;
  ctaHref: string;
  ctaLabel: string;
  content: React.ReactNode;
  primaryActions?: React.ReactNode;
} {
  const name = alert.displayName?.trim() || "Unnamed";

  if (alert.kind === "rsvp_pending") {
    const eventTitle = alert.eventTitle?.trim() || "Upcoming event";
    const eventTypeLabel =
      alert.eventType === "game"
        ? "Game"
        : alert.eventType === "practice"
          ? "Practice"
          : alert.eventType === "scrimmage"
            ? "Scrimmage"
            : "Event";
    const timeStr = alert.eventStartsAt
      ? formatEventTime(alert.eventStartsAt)
      : null;
    return {
      title: `${eventTypeLabel}: ${eventTitle}`,
      body: null,
      ctaHref: `/playbooks/${alert.playbookId}?tab=calendar`,
      ctaLabel: "View in calendar",
      content: (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">When</dt>
          <dd className="text-foreground" suppressHydrationWarning>
            {timeStr ?? "Time not set"}
          </dd>
          <dt className="text-muted">Type</dt>
          <dd className="text-foreground">{eventTypeLabel}</dd>
        </dl>
      ),
      primaryActions: (
        <>
          {(["yes", "maybe", "no"] as const).map((s) => {
            const labels = { yes: "Going", maybe: "Maybe", no: "Can’t go" };
            const colors = {
              yes: "bg-emerald-600 hover:bg-emerald-700",
              maybe: "bg-amber-500 hover:bg-amber-600",
              no: "bg-red-600 hover:bg-red-700",
            };
            const busyKey = `rsvp:${s}:${alert.key}`;
            return (
              <button
                key={s}
                type="button"
                disabled={busy !== null}
                onClick={() => onRsvp(alert, s)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${colors[s]}`}
              >
                {busy === busyKey ? "…" : labels[s]}
              </button>
            );
          })}
        </>
      ),
    };
  }

  if (
    alert.kind === "membership" ||
    alert.kind === "coach_upgrade" ||
    alert.kind === "roster_claim"
  ) {
    const ctaHref = `/playbooks/${alert.playbookId}?tab=roster`;
    let title: string;
    let body: string | null = null;
    let approveLabel = "Approve";
    let rejectLabel = "Reject";
    let approveMsg = `Approved ${name}`;
    let rejectMsg = `Rejected ${name}`;
    if (alert.kind === "roster_claim") {
      const slot = alert.rosterLabel?.trim() || "an unclaimed roster spot";
      const jersey = alert.jerseyNumber?.trim();
      title = `Roster claim from ${name}`;
      body = `Wants to claim ${slot}${jersey ? ` (#${jersey})` : ""}.${alert.note?.trim() ? `\n\n${alert.note.trim()}` : ""}`;
      approveMsg = `Linked ${name} to ${slot}`;
      rejectMsg = `Rejected ${name}'s claim`;
    } else if (alert.kind === "coach_upgrade") {
      title = `Coach access request from ${name}`;
      body = "Already a player on this team — wants edit privileges.";
      approveLabel = "Grant";
      rejectLabel = "Deny";
      approveMsg = `Granted coach access to ${name}`;
      rejectMsg = `Denied coach request from ${name}`;
    } else {
      title = `Join request from ${name}`;
      body = `Wants to join as a ${alert.role ?? "viewer"}.`;
    }
    const approveKey = `a:${alert.key}`;
    const rejectKey = `r:${alert.key}`;
    return {
      title,
      body,
      ctaHref,
      ctaLabel: "View in roster",
      content: null,
      primaryActions: (
        <>
          <Button
            size="sm"
            variant="ghost"
            leftIcon={X}
            disabled={busy !== null}
            onClick={() => onAct(alert, "reject", rejectKey, rejectMsg)}
          >
            {busy === rejectKey ? "…" : rejectLabel}
          </Button>
          <Button
            size="sm"
            variant="primary"
            leftIcon={Check}
            disabled={busy !== null}
            onClick={() => onAct(alert, "approve", approveKey, approveMsg)}
          >
            {busy === approveKey ? "…" : approveLabel}
          </Button>
        </>
      ),
    };
  }

  // Notification-style rows (mention / share / system_alert / admin_notice).
  // They already carry a body and an optional href; we just structure the
  // panel so the body is readable and the deep link is a single click.
  const ctaHref = alert.href || `/playbooks/${alert.playbookId}`;
  const ctaLabel =
    alert.kind === "admin_notice"
      ? "Open"
      : alert.kind === "mention"
        ? "View play"
        : alert.kind === "share"
          ? "View"
          : "View";
  return {
    title: alert.displayName?.trim() || titleForKind(alert.kind),
    body: alert.body?.trim() || null,
    ctaHref,
    ctaLabel,
    content: alert.severity && alert.severity !== "info" ? (
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Severity: {alert.severity}
      </p>
    ) : null,
  };
}

function RecentActivity({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="space-y-2 pt-2">
      <div>
        <h3 className="text-sm font-bold text-foreground">Recent</h3>
        <p className="text-xs text-muted">
          Updates from your playbooks. No action needed.
        </p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {entries.map((e) => (
          <ActivityRow key={e.id} entry={e} />
        ))}
      </ul>
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const actor = entry.actorDisplayName?.trim() || "Someone";
  let icon: React.ReactNode;
  let title: string;
  let detail: string | null = null;
  let href: string;
  if (entry.kind === "play_update") {
    icon = <Megaphone className="size-4 text-primary" />;
    title = `${actor} updated ${entry.playName ?? "a play"}`;
    detail = entry.comment?.trim() || null;
    href = entry.playId
      ? `/playbooks/${entry.playbookId}/plays/${entry.playId}`
      : `/playbooks/${entry.playbookId}`;
  } else {
    icon = <UserPlus className="size-4 text-secondary" />;
    const role = entry.joinedRole ?? "viewer";
    title = `${actor} joined as ${role}`;
    href = `/playbooks/${entry.playbookId}?tab=roster`;
  }
  return (
    <li className="flex items-start gap-3 p-3">
      <PlaybookAvatar
        name={entry.playbookName}
        logoUrl={entry.playbookLogoUrl}
        color={entry.playbookColor}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/playbooks/${entry.playbookId}`}
            className="truncate text-xs font-semibold text-muted hover:text-foreground hover:underline"
          >
            {entry.playbookName}
          </Link>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-inset px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {icon}
            {entry.kind === "play_update" ? "update" : "joined"}
          </span>
          <span className="text-[11px] text-muted-light">
            {timeAgo(entry.occurredAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-foreground">{title}</p>
        {detail && (
          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-muted">
            {detail}
          </p>
        )}
      </div>
      <Link
        href={href}
        className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
        title="Open"
      >
        <ArrowUpRight className="size-4" />
      </Link>
    </li>
  );
}

function DigestSettingsModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<DigestPlaybookPref[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listDigestPlaybooksAction();
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems(res.items);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(item: DigestPlaybookPref, next: Partial<DigestPlaybookPref>) {
    const updated = { ...item, ...next };
    setItems((prev) =>
      prev
        ? prev.map((p) => (p.playbookId === item.playbookId ? updated : p))
        : prev,
    );
    startSaving(async () => {
      const tz =
        next.timezone ??
        (typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : null);
      const res = await updateDigestPrefsAction({
        playbookId: item.playbookId,
        optedOut: updated.optedOut,
        sendHourLocal: updated.sendHourLocal,
        timezone: tz ?? null,
      });
      if (!res.ok) toast(res.error, "error");
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Daily digest email settings"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="text-sm text-muted">
        Once a day, we email a roll-up of new plays, coach broadcasts, and
        teammates joining — but only if there&apos;s something to share. No
        email on quiet days.
      </p>
      {error && (
        <p className="mt-3 rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {items === null && !error && (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      )}
      {items && items.length === 0 && (
        <p className="mt-3 text-sm text-muted">
          You aren&apos;t a member of any playbooks yet.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li
              key={item.playbookId}
              className="flex flex-wrap items-center gap-3 p-3"
            >
              <PlaybookAvatar
                name={item.playbookName}
                logoUrl={item.playbookLogoUrl}
                color={item.playbookColor}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {item.playbookName}
                </p>
                <p className="text-[11px] text-muted">
                  Sends at{" "}
                  {hourLabel(item.sendHourLocal)} {item.timezone}
                </p>
              </div>
              <select
                value={item.sendHourLocal}
                onChange={(e) =>
                  update(item, { sendHourLocal: parseInt(e.target.value, 10) })
                }
                disabled={item.optedOut || saving}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={!item.optedOut}
                  onChange={(e) =>
                    update(item, { optedOut: !e.target.checked })
                  }
                  disabled={saving}
                  className="size-3.5 accent-primary"
                />
                On
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function ResolvedList({
  loading,
  events,
  showRsvps,
  onToggleRsvps,
}: {
  loading: boolean;
  events: ResolvedInboxEvent[];
  showRsvps: boolean;
  onToggleRsvps: () => void;
}) {
  const rsvpCount = events.filter((e) => e.kind === "rsvp_response").length;
  const visible = showRsvps
    ? events
    : events.filter((e) => e.kind !== "rsvp_response");

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center text-sm text-muted">
        Loading history…
      </div>
    );
  }

  const filterChip = rsvpCount > 0 && (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <FilterChip
        active={showRsvps}
        onClick={onToggleRsvps}
        label="My RSVPs"
        count={rsvpCount}
      />
    </div>
  );

  if (visible.length === 0) {
    return (
      <>
        {filterChip}
        <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <Inbox className="mx-auto size-8 text-muted" />
          <h2 className="mt-3 text-base font-bold text-foreground">
            No resolved items yet
          </h2>
          <p className="mt-1 text-sm text-muted">
            Once you approve or reject a request, it&apos;ll show up here.
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      {filterChip}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {visible.map((e) => (
          <ResolvedRow key={e.id} event={e} />
        ))}
      </ul>
    </>
  );
}

function ResolvedRow({ event }: { event: ResolvedInboxEvent }) {
  const isRsvp = event.kind === "rsvp_response";
  const name = event.subjectDisplayName?.trim() || "Unnamed";
  let title: string;
  if (isRsvp) {
    const eventTypeLabel =
      event.detail.eventType === "game"
        ? "Game"
        : event.detail.eventType === "practice"
          ? "Practice"
          : event.detail.eventType === "scrimmage"
            ? "Scrimmage"
            : "Event";
  const eventTitle = event.detail.eventTitle?.trim() || "Upcoming event";
    const reply =
      event.action === "yes" ? "Yes" : event.action === "no" ? "No" : "Maybe";
    title = `RSVP'd ${reply} — ${eventTypeLabel}: ${eventTitle}`;
  } else if (event.kind === "roster_claim") {
    const approved = event.action === "approved";
    const slot = event.detail.rosterLabel?.trim() || "an unclaimed roster spot";
    const jersey = event.detail.jerseyNumber?.trim();
    title = approved
      ? `Linked ${name} to ${slot}${jersey ? ` (#${jersey})` : ""}`
      : `Rejected ${name}'s claim on ${slot}${jersey ? ` (#${jersey})` : ""}`;
  } else if (event.kind === "coach_upgrade") {
    const approved = event.action === "approved";
    title = approved
      ? `Granted coach access to ${name}`
      : `Denied coach request from ${name}`;
  } else {
    const approved = event.action === "approved";
    const role = event.detail.role ?? "viewer";
    title = approved
      ? `Approved ${name} as ${role}`
      : `Rejected ${name}'s request to join as ${role}`;
  }
  const byName = event.resolvedByDisplayName?.trim();
  const href = isRsvp
    ? `/playbooks/${event.playbookId}?tab=calendar`
    : `/playbooks/${event.playbookId}?tab=roster`;
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <PlaybookAvatar
          name={event.playbookName}
          logoUrl={event.playbookLogoUrl}
          color={event.playbookColor}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={href}
              className="truncate text-xs font-semibold text-muted hover:text-foreground hover:underline"
            >
              {event.playbookName}
            </Link>
            <KindBadge kind={event.kind} />
            <ResolutionBadge action={event.action} />
            <span className="text-[11px] text-muted-light">
              {timeAgo(event.resolvedAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">{title}</p>
          {!isRsvp && byName && (
            <p className="mt-0.5 text-xs text-muted">by {byName}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={href}
          className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          title={isRsvp ? "Open in calendar" : "Open in playbook"}
        >
          {isRsvp ? <Calendar className="size-4" /> : <ArrowUpRight className="size-4" />}
        </Link>
      </div>
    </li>
  );
}

function ResolutionBadge({
  action,
}: {
  action: ResolvedInboxEvent["action"];
}) {
  if (action === "yes") {
    return (
      <span className="rounded-full bg-success-light px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
        yes
      </span>
    );
  }
  if (action === "no") {
    return (
      <span className="rounded-full bg-danger-light px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
        no
      </span>
    );
  }
  if (action === "maybe") {
    return (
      <span className="rounded-full bg-warning-light px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
        maybe
      </span>
    );
  }
  const ok = action === "approved";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        ok ? "bg-success-light text-success" : "bg-danger-light text-danger"
      }`}
    >
      {ok ? "approved" : "rejected"}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 font-medium ring-1 transition-colors ${
        active
          ? "bg-primary text-primary-foreground ring-primary"
          : "bg-surface text-muted ring-border hover:text-foreground"
      }`}
    >
      {label}{" "}
      <span
        className={`ml-1 rounded-full px-1.5 py-px text-[10px] ${
          active ? "bg-white/20" : "bg-surface-inset text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

type RowChromeProps = {
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onArchive: (alert: InboxAlert) => void;
  onDelete: (alert: InboxAlert) => void;
  onUnarchive: (alert: InboxAlert) => void;
  /** Open the lightweight detail panel for this alert without leaving the
   *  inbox. The panel itself surfaces a "View in [context]" link for
   *  full navigation. */
  onPreview: (alert: InboxAlert) => void;
  /** Flip read ↔ unread state. Used by the right-swipe gesture on mobile
   *  and (eventually) a "Mark unread" item in a row context menu. */
  onToggleRead: (alert: InboxAlert) => void;
  /** Email-style "unread" flag. Drives the bold/lighter row treatment and
   *  the leading indicator dot. Persisted client-side only — see
   *  READ_KEYS_KEY in this file. */
  unread: boolean;
};

function AlertRow({
  alert,
  busy,
  onAct,
  onRsvp,
  selectMode,
  selected,
  onToggleSelect,
  onArchive,
  onDelete,
  onUnarchive,
  onPreview,
  onToggleRead,
  unread,
}: {
  alert: InboxAlert;
  busy: string | null;
  onAct: (
    alert: InboxAlert,
    op: "approve" | "reject",
    busyKey: string,
    okMsg: string,
  ) => void;
  onRsvp: (alert: InboxAlert, status: "yes" | "no" | "maybe") => void;
} & RowChromeProps) {
  const chromeProps: RowChromeProps = {
    selectMode,
    selected,
    onToggleSelect,
    onArchive,
    onDelete,
    onUnarchive,
    onPreview,
    onToggleRead,
    unread,
  };
  if (alert.kind === "rsvp_pending") {
    return (
      <RsvpRow
        alert={alert}
        busy={busy}
        onRsvp={onRsvp}
        {...chromeProps}
      />
    );
  }
  if (
    alert.kind === "system_alert" ||
    alert.kind === "mention" ||
    alert.kind === "share" ||
    alert.kind === "admin_notice"
  ) {
    return <NotificationRow alert={alert} {...chromeProps} />;
  }
  const approveKey = `a:${alert.key}`;
  const rejectKey = `r:${alert.key}`;
  const name = alert.displayName?.trim() || "Unnamed";

  let title: string;
  let detail: string | null = null;
  let approveLabel: string;
  let rejectLabel: string;
  let approveMsg: string;
  let rejectMsg: string;

  if (alert.kind === "roster_claim") {
    const slot = alert.rosterLabel?.trim() || "an unclaimed roster spot";
    const jersey = alert.jerseyNumber?.trim();
    title = `${name} wants to claim ${slot}${jersey ? ` (#${jersey})` : ""}`;
    detail = alert.note?.trim() || null;
    approveLabel = "Approve";
    rejectLabel = "Reject";
    approveMsg = `Linked ${name} to ${slot}`;
    rejectMsg = `Rejected ${name}'s claim`;
  } else if (alert.kind === "coach_upgrade") {
    title = `${name} is requesting coach access`;
    detail = "Already a player — wants edit privileges.";
    approveLabel = "Grant";
    rejectLabel = "Deny";
    approveMsg = `Granted coach access to ${name}`;
    rejectMsg = `Denied coach request from ${name}`;
  } else {
    title = `${name} wants to join as a ${alert.role ?? "viewer"}`;
    approveLabel = "Approve";
    rejectLabel = "Reject";
    approveMsg = `Approved ${name}`;
    rejectMsg = `Rejected ${name}`;
  }

  const ctaHref = `/playbooks/${alert.playbookId}?tab=roster`;
  return (
    <RowFrame
      alert={alert}
      ctaHref={ctaHref}
      ctaTitle="Open in roster"
      busy={busy}
      onArchive={onArchive}
      onDelete={onDelete}
      onUnarchive={onUnarchive}
      onPreview={onPreview}
      unread={unread}
      onToggleRead={onToggleRead}
      selectMode={selectMode}
      selected={selected}
      onToggleSelect={onToggleSelect}
      body={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={ctaHref}
              className="truncate text-xs font-semibold text-muted hover:text-foreground hover:underline"
              onClick={(e) => selectMode && e.preventDefault()}
            >
              {alert.playbookName}
            </Link>
            <KindBadge kind={alert.kind} adminKind={alert.adminKind} />
            <span className="text-[11px] text-muted-light">
              {timeAgo(alert.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">{title}</p>
          {detail && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{detail}</p>
          )}
        </>
      }
      inlineActions={
        alert.status === "active" ? (
          <>
            <Button
              size="sm"
              variant="primary"
              leftIcon={Check}
              disabled={busy !== null}
              onClick={() => onAct(alert, "approve", approveKey, approveMsg)}
            >
              {busy === approveKey ? "…" : approveLabel}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={X}
              disabled={busy !== null}
              onClick={() => onAct(alert, "reject", rejectKey, rejectMsg)}
            >
              {busy === rejectKey ? "…" : rejectLabel}
            </Button>
          </>
        ) : null
      }
    />
  );
}

/**
 * Shared chrome for every inbox row. Owns:
 *   - The leading element (checkbox in select mode, playbook avatar otherwise)
 *   - Inline kind-specific actions (passed in as `inlineActions`)
 *   - The trailing utility cluster: open-in-context link, archive (or restore
 *     when alert is archived), and delete.
 *
 * The body slot is opaque — each kind renders its own headline/detail layout.
 */
function RowFrame({
  alert,
  ctaHref: _ctaHref,
  ctaTitle: _ctaTitle,
  ctaIcon: _ctaIcon,
  body,
  inlineActions,
  busy,
  onArchive,
  onDelete,
  onUnarchive,
  onPreview,
  onToggleRead,
  selectMode,
  selected,
  onToggleSelect,
  unread,
}: {
  alert: InboxAlert;
  ctaHref: string;
  ctaTitle: string;
  ctaIcon?: React.ReactNode;
  body: React.ReactNode;
  inlineActions?: React.ReactNode;
  busy: string | null;
  onArchive: (a: InboxAlert) => void;
  onDelete: (a: InboxAlert) => void;
  onUnarchive: (a: InboxAlert) => void;
  onPreview: (a: InboxAlert) => void;
  onToggleRead: (a: InboxAlert) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  unread: boolean;
}) {
  const archiveKey = `arch:${alert.key}`;
  const deleteKey = `del:${alert.key}`;
  const unarchKey = `unarch:${alert.key}`;
  const isArchived = alert.status === "archived";
  // ─── Mobile swipe gestures ─────────────────────────────────────────
  // iOS-style row swipe: drag left to archive (or unarchive if currently
  // archived), drag right to flip read/unread. Threshold is 80px before
  // the action commits on release; below that the row snaps back.
  // touchstart records origin; touchmove distinguishes horizontal swipes
  // from vertical scroll (we abort if dy > dx) so list scrolling isn't
  // hijacked. touchend commits or snaps back. Pointer/desktop users still
  // get the trailing icon buttons for the same actions.
  const [dragX, setDragX] = useState(0);
  const dragStartRef = useRef<
    | { x: number; y: number; mode: "detecting" | "swiping" }
    | null
  >(null);
  // Click-suppression flag. Set in touchend when a real swipe happened,
  // consumed by the row's onClick handler so the row doesn't open the
  // preview panel right after the swipe action commits.
  const justSwipedRef = useRef(false);
  const SWIPE_THRESHOLD = 80;
  const SWIPE_MAX = 220;
  function onTouchStart(e: React.TouchEvent<HTMLLIElement>) {
    if (selectMode) return;
    const t = e.touches[0];
    dragStartRef.current = { x: t.clientX, y: t.clientY, mode: "detecting" };
  }
  function onTouchMove(e: React.TouchEvent<HTMLLIElement>) {
    const start = dragStartRef.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (start.mode === "detecting") {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        dragStartRef.current = null;
        return;
      }
      start.mode = "swiping";
    }
    setDragX(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dx)));
  }
  function onTouchEnd() {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start || start.mode !== "swiping") {
      setDragX(0);
      return;
    }
    justSwipedRef.current = true;
    setTimeout(() => {
      justSwipedRef.current = false;
    }, 350);
    if (dragX <= -SWIPE_THRESHOLD) {
      if (isArchived) onUnarchive(alert);
      else onArchive(alert);
    } else if (dragX >= SWIPE_THRESHOLD) {
      onToggleRead(alert);
    }
    setDragX(0);
  }
  function onTouchCancel() {
    dragStartRef.current = null;
    setDragX(0);
  }
  const isSwiping = dragX !== 0;
  const leftRevealActive = dragX >= SWIPE_THRESHOLD;
  const rightRevealActive = dragX <= -SWIPE_THRESHOLD;
  // Foreground row classes (extracted so we can reuse the same chrome under
  // the swipe-translatable wrapper). Feedback rows get a red left rail + tint
  // so they read as urgent at a glance.
  const isFeedback = isFeedbackAlert(alert);
  const fgClasses = `group relative flex items-center gap-3 ${
    isFeedback ? "border-l-4 border-red-600 pl-4" : "pl-5"
  } pr-3 py-2.5 transition-colors ${
    selectMode
      ? "cursor-pointer"
      : unread && !isArchived
        ? "cursor-pointer bg-primary/[0.04]"
        : "cursor-pointer bg-surface"
  } ${selected ? "bg-primary/10" : isFeedback ? "bg-red-50 dark:bg-red-950/30" : ""}`;
  const readLabel = unread ? "Mark read" : "Mark unread";
  return (
    <li
      className={`relative overflow-hidden ${
        isArchived ? "opacity-70" : !unread && !selectMode ? "opacity-80" : ""
      }`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      {/* Reveal layers — only render while a swipe is in progress, and
          only on the side the user is dragging toward. This avoids
          bleed-through when the foreground row's bg has any transparency
          (the unread tint), and keeps the static idle list clean. */}
      {!selectMode && isSwiping && dragX > 0 && (
        <div
          aria-hidden
          className={`absolute inset-y-0 left-0 flex items-center px-4 text-xs font-semibold text-white transition-colors ${
            leftRevealActive ? "bg-primary" : "bg-primary/70"
          }`}
          style={{ width: Math.min(dragX + 32, SWIPE_MAX) }}
        >
          <Inbox className="mr-2 size-4" />
          {readLabel}
        </div>
      )}
      {!selectMode && isSwiping && dragX < 0 && (
        <div
          aria-hidden
          className={`absolute inset-y-0 right-0 flex items-center justify-end px-4 text-xs font-semibold text-white transition-colors ${
            rightRevealActive
              ? isArchived
                ? "bg-emerald-600"
                : "bg-amber-600"
              : isArchived
                ? "bg-emerald-500"
                : "bg-amber-500"
          }`}
          style={{ width: Math.min(-dragX + 32, SWIPE_MAX) }}
        >
          {isArchived ? (
            <ArchiveRestore className="mr-2 size-4" />
          ) : (
            <Archive className="mr-2 size-4" />
          )}
          {isArchived ? "Restore" : "Archive"}
        </div>
      )}

      {/* Foreground — the actual row content. Translates horizontally
          while the user swipes; snaps back on release with a transition. */}
      <div
        className={fgClasses}
        style={{
          transform: `translate3d(${dragX}px, 0, 0)`,
          transition: isSwiping ? "none" : "transform 200ms ease-out",
        }}
        onClick={() => {
          if (justSwipedRef.current) return;
          if (selectMode) onToggleSelect();
          else onPreview(alert);
        }}
      >
        {/* Unread indicator: a small primary dot on the leading edge.
            Email convention; pulls the eye to rows that still need a look. */}
        {unread && !selectMode && !isArchived && (
          <span
            aria-label="Unread"
            className="absolute left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_2px_rgba(255,255,255,0.6)]"
          />
        )}
        {selectMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={`flex size-5 shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors ${
              selected
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface-raised text-transparent hover:border-primary/50"
            }`}
            aria-label={selected ? "Deselect" : "Select"}
          >
            <Check className="size-3" strokeWidth={3} />
          </button>
        )}
        <PlaybookAvatar
          name={alert.playbookName}
          logoUrl={alert.playbookLogoUrl}
          color={alert.playbookColor}
          size="sm"
        />
        <div
          className={`min-w-0 flex-1 [&>p:first-of-type]:transition ${
            unread
              ? "[&>p:first-of-type]:font-semibold [&>p:first-of-type]:text-foreground"
              : "[&>p:first-of-type]:font-normal"
          }`}
        >
          {body}
        </div>
        {!selectMode && (
        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="hidden items-center gap-1 sm:flex">{inlineActions}</div>
          {isArchived ? (
            <IconButton
              onClick={() => onUnarchive(alert)}
              disabled={busy !== null}
              icon={<ArchiveRestore className="size-3.5" />}
              title="Restore to Active"
              tone="muted"
            />
          ) : (
            <IconButton
              onClick={() => onArchive(alert)}
              disabled={busy !== null}
              icon={
                busy === archiveKey ? (
                  <MoreHorizontal className="size-3.5 animate-pulse" />
                ) : (
                  <Archive className="size-3.5" />
                )
              }
              title="Archive"
              tone="muted"
            />
          )}
          <IconButton
            onClick={() => onDelete(alert)}
            disabled={busy !== null}
            icon={
              busy === deleteKey || busy === unarchKey ? (
                <MoreHorizontal className="size-3.5 animate-pulse" />
              ) : (
                <Trash2 className="size-3.5" />
              )
            }
            title="Delete"
            tone="danger"
          />
        </div>
      )}
      </div>
    </li>
  );
}

/** Compact icon button used in the row trailing cluster. Keeps hit-area
 *  touch-friendly (32px) while the icon itself stays small (14px). */
function IconButton({
  onClick,
  disabled,
  icon,
  title,
  tone = "muted",
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
  tone?: "muted" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === "danger"
          ? "hover:bg-danger-light hover:text-danger"
          : "hover:bg-surface-inset hover:text-foreground"
      }`}
    >
      {icon}
    </button>
  );
}

function labelForRsvp(s: "yes" | "no" | "maybe"): string {
  return s === "yes" ? "Yes" : s === "no" ? "No" : "Maybe";
}

function RsvpRow({
  alert,
  busy,
  onRsvp,
  selectMode,
  selected,
  onToggleSelect,
  onArchive,
  onDelete,
  onUnarchive,
  onPreview,
  onToggleRead,
  unread,
}: {
  alert: InboxAlert;
  busy: string | null;
  onRsvp: (alert: InboxAlert, status: "yes" | "no" | "maybe") => void;
} & RowChromeProps) {
  const title = alert.eventTitle?.trim() || "Upcoming event";
  const startsAt = alert.eventStartsAt
    ? formatEventTime(alert.eventStartsAt)
    : "";
  const eventTypeLabel =
    alert.eventType === "game"
      ? "Game"
      : alert.eventType === "practice"
        ? "Practice"
        : alert.eventType === "scrimmage"
          ? "Scrimmage"
          : "Event";
  const href = `/playbooks/${alert.playbookId}?tab=calendar`;
  const inlineActions =
    alert.status === "active" ? (
      <>
        {(["yes", "maybe", "no"] as const).map((s) => {
          const labels = { yes: "Going", maybe: "Maybe", no: "Can\u2019t go" };
          const colors = {
            yes: "bg-emerald-100 text-emerald-800 ring-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800",
            maybe:
              "bg-amber-100 text-amber-800 ring-amber-300 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
            no: "bg-red-100 text-red-800 ring-red-300 hover:bg-red-200 dark:bg-red-950 dark:text-red-100 dark:ring-red-800",
          };
          const busyKey = `rsvp:${s}:${alert.key}`;
          return (
            <button
              key={s}
              type="button"
              disabled={busy !== null}
              onClick={() => onRsvp(alert, s)}
              className={
                "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition disabled:opacity-60 " +
                colors[s]
              }
            >
              {busy === busyKey ? "\u2026" : labels[s]}
            </button>
          );
        })}
      </>
    ) : null;

  return (
    <RowFrame
      alert={alert}
      ctaHref={href}
      ctaTitle="Open in calendar"
      ctaIcon={<Calendar className="size-4" />}
      busy={busy}
      onArchive={onArchive}
      onDelete={onDelete}
      onUnarchive={onUnarchive}
      onPreview={onPreview}
      unread={unread}
      onToggleRead={onToggleRead}
      selectMode={selectMode}
      selected={selected}
      onToggleSelect={onToggleSelect}
      body={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={href}
              className="truncate text-xs font-semibold text-muted hover:text-foreground hover:underline"
              onClick={(e) => selectMode && e.preventDefault()}
            >
              {alert.playbookName}
            </Link>
            <KindBadge kind={alert.kind} adminKind={alert.adminKind} />
            <span
              className="text-[11px] text-muted-light"
              suppressHydrationWarning
            >
              {startsAt}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {eventTypeLabel}: {title}
          </p>
        </>
      }
      inlineActions={inlineActions}
    />
  );
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PlaybookAvatar({
  name,
  logoUrl,
  color,
  size = "md",
}: {
  name: string;
  logoUrl: string | null;
  color: string | null;
  /** "md" = 36px (default, used in standalone contexts).
   *  "sm" = 28px (used inside dense inbox rows). */
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "size-7" : "size-9";
  const fontSize = size === "sm" ? "text-[10px]" : "text-[11px]";
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoUrl}
        alt=""
        className={`${dim} shrink-0 rounded-md object-cover`}
      />
    );
  }
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PB";
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-md ${fontSize} font-bold text-white`}
      style={{ backgroundColor: color ?? "#64748B" }}
    >
      {initials}
    </div>
  );
}

function KindBadge({
  kind,
  adminKind,
}: {
  kind: InboxAlertKind | ResolvedKind;
  adminKind?: AdminNoticeKind;
}) {
  // Feedback gets a loud solid-red pill so it's unmistakable in the row.
  if (kind === "admin_notice" && adminKind === "feedback_received") {
    return (
      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        feedback
      </span>
    );
  }
  // Rating-nudge outcomes (left a review / dismissed) read as "review".
  if (kind === "admin_notice" && adminKind === "review_prompt") {
    return (
      <span className="rounded-full bg-warning-light px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
        review
      </span>
    );
  }
  const map: Record<InboxAlertKind | ResolvedKind, { label: string; cls: string }> = {
    roster_claim: { label: "claim", cls: "bg-primary/10 text-primary" },
    membership: { label: "join", cls: "bg-secondary/10 text-secondary" },
    coach_upgrade: { label: "coach", cls: "bg-warning-light text-warning" },
    rsvp_pending: { label: "rsvp", cls: "bg-success-light text-success" },
    rsvp_response: { label: "rsvp", cls: "bg-success-light text-success" },
    system_alert: { label: "billing", cls: "bg-danger-light text-danger" },
    mention: { label: "mention", cls: "bg-primary/10 text-primary" },
    share: { label: "share", cls: "bg-secondary/10 text-secondary" },
    admin_notice: { label: "system", cls: "bg-foreground/10 text-foreground" },
  };
  const { label, cls } = map[kind];
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function NotificationRow({
  alert,
  selectMode,
  selected,
  onToggleSelect,
  onArchive,
  onDelete,
  onUnarchive,
  onPreview,
  onToggleRead,
  unread,
}: {
  alert: InboxAlert;
} & RowChromeProps) {
  const title = alert.displayName?.trim() || titleForKind(alert.kind);
  const body = alert.body?.trim() || null;
  const href = alert.href || `/playbooks/${alert.playbookId}`;
  return (
    <RowFrame
      alert={alert}
      ctaHref={href}
      ctaTitle="Open"
      busy={null}
      onArchive={onArchive}
      onDelete={onDelete}
      onUnarchive={onUnarchive}
      onPreview={onPreview}
      unread={unread}
      onToggleRead={onToggleRead}
      selectMode={selectMode}
      selected={selected}
      onToggleSelect={onToggleSelect}
      body={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={href}
              className="truncate text-xs font-semibold text-muted hover:text-foreground hover:underline"
              onClick={(e) => selectMode && e.preventDefault()}
            >
              {alert.playbookName}
            </Link>
            <KindBadge kind={alert.kind} adminKind={alert.adminKind} />
            <span className="text-[11px] text-muted-light">
              {timeAgo(alert.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">{title}</p>
          {body && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{body}</p>
          )}
          {alert.adminKind === "user_signup" && alert.invitedByEmail && (
            <p className="mt-0.5 truncate text-xs text-muted">
              Referred by{" "}
              <Link
                href={`/settings?tab=users&q=${encodeURIComponent(alert.invitedByEmail)}`}
                className="font-medium text-foreground hover:underline"
                onClick={(e) => selectMode && e.preventDefault()}
              >
                {alert.invitedByName || alert.invitedByEmail}
              </Link>
            </p>
          )}
        </>
      }
    />
  );
}

function titleForKind(kind: InboxAlertKind): string {
  switch (kind) {
    case "system_alert":
      return "Account notice";
    case "mention":
      return "You were mentioned";
    case "share":
      return "New from your team";
    case "admin_notice":
      return "System notice";
    default:
      return "Notification";
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.max(1, Math.round(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
