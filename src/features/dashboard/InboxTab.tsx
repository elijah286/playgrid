"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowUpRight,
  Calendar,
  Check,
  Inbox,
  Megaphone,
  Settings,
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
import { setRsvpAction } from "@/app/actions/calendar";
import {
  listResolvedInboxEventsAction,
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

type SortMode = "urgency" | "newest" | "oldest";
type FilterKind =
  | "all"
  | "billing"
  | "rsvp"
  | "roster"
  | "comments"
  | "shares";
type ViewMode = "pending" | "resolved";

/** Lower bucket = more urgent. Drives default sort and the inbox tab's red badge. */
function urgencyBucket(a: InboxAlert): number {
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
  return false;
}

export function InboxTab({
  initialAlerts,
  initialActivity = [],
}: {
  initialAlerts: InboxAlert[];
  initialActivity?: ActivityEntry[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<InboxAlert[]>(initialAlerts);
  const [busy, setBusy] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("urgency");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [view, setView] = useState<ViewMode>("pending");
  const [resolved, setResolved] = useState<ResolvedInboxEvent[] | null>(null);
  const [resolvedLoading, setResolvedLoading] = useState(false);
  const [showRsvps, setShowRsvps] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("settings") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep-link from email
      setSettingsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (view !== "resolved" || resolved !== null) return;
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

  const counts = useMemo(() => {
    const c = { all: 0, billing: 0, rsvp: 0, roster: 0, comments: 0, shares: 0 };
    for (const a of alerts) {
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
    }
    return c;
  }, [alerts]);

  const visible = useMemo(() => {
    const filtered = alerts.filter((a) => matchesFilter(a, filter));
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
  }, [alerts, sort, filter]);

  function removeByKey(key: string) {
    setAlerts((prev) => prev.filter((a) => a.key !== key));
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
    startTransition(async () => {
      try {
        const res = await setRsvpAction({
          eventId,
          occurrenceDate,
          status,
          note: null,
        });
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        removeByKey(alert.key);
        toast(`RSVP'd ${labelForRsvp(status)}`, "success");
        router.refresh();
      } catch (e) {
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
          toast(res.error, "error");
          return;
        }
        removeByKey(alert.key);
        toast(okMsg, "success");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong.", "error");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">
            {view === "pending" ? "Needs your attention" : "Recently resolved"}
          </h2>
          <p className="text-xs text-muted">
            {view === "pending"
              ? `${alerts.length} item${alerts.length === 1 ? "" : "s"} waiting across your playbooks.`
              : "History of approvals and rejections."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-inset hover:text-foreground"
            title="Daily digest email settings"
          >
            <Settings className="size-3.5" />
            Email settings
          </button>
          <SegmentedControl<ViewMode>
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "pending", label: "Pending" },
              { value: "resolved", label: "Resolved" },
            ]}
          />
          {view === "pending" && (
            <SegmentedControl<SortMode>
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: "urgency", label: "Urgency" },
                { value: "newest", label: "Newest" },
                { value: "oldest", label: "Oldest" },
              ]}
            />
          )}
        </div>
      </div>

      {view === "pending" ? (
        alerts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center">
            <Inbox className="mx-auto size-8 text-muted" />
            <h2 className="mt-3 text-base font-bold text-foreground">
              You're all caught up
            </h2>
            <p className="mt-1 text-sm text-muted">
              Nothing waiting on you right now. Upcoming events that need an
              RSVP, roster claims, and join requests will show up here.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <FilterChip
                active={filter === "all"}
                onClick={() => setFilter("all")}
                label="All"
                count={counts.all}
              />
              {counts.billing > 0 && (
                <FilterChip
                  active={filter === "billing"}
                  onClick={() => setFilter("billing")}
                  label="Billing"
                  count={counts.billing}
                />
              )}
              {counts.rsvp > 0 && (
                <FilterChip
                  active={filter === "rsvp"}
                  onClick={() => setFilter("rsvp")}
                  label="RSVPs"
                  count={counts.rsvp}
                />
              )}
              {counts.roster > 0 && (
                <FilterChip
                  active={filter === "roster"}
                  onClick={() => setFilter("roster")}
                  label="Roster"
                  count={counts.roster}
                />
              )}
              {counts.comments > 0 && (
                <FilterChip
                  active={filter === "comments"}
                  onClick={() => setFilter("comments")}
                  label="Comments"
                  count={counts.comments}
                />
              )}
              {counts.shares > 0 && (
                <FilterChip
                  active={filter === "shares"}
                  onClick={() => setFilter("shares")}
                  label="Shares"
                  count={counts.shares}
                />
              )}
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {visible.map((alert) => (
                <AlertRow
                  key={alert.key}
                  alert={alert}
                  busy={busy}
                  onAct={act}
                  onRsvp={actRsvp}
                />
              ))}
            </ul>
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

      {view === "pending" && initialActivity.length > 0 && (
        <RecentActivity entries={initialActivity} />
      )}

      {settingsOpen && (
        <DigestSettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
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

function AlertRow({
  alert,
  busy,
  onAct,
  onRsvp,
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
}) {
  if (alert.kind === "rsvp_pending") {
    return <RsvpRow alert={alert} busy={busy} onRsvp={onRsvp} />;
  }
  if (
    alert.kind === "system_alert" ||
    alert.kind === "mention" ||
    alert.kind === "share"
  ) {
    return <NotificationRow alert={alert} />;
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

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <PlaybookAvatar
          name={alert.playbookName}
          logoUrl={alert.playbookLogoUrl}
          color={alert.playbookColor}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/playbooks/${alert.playbookId}?tab=roster`}
              className="truncate text-xs font-semibold text-muted hover:text-foreground hover:underline"
            >
              {alert.playbookName}
            </Link>
            <KindBadge kind={alert.kind} />
            <span className="text-[11px] text-muted-light">
              {timeAgo(alert.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">{title}</p>
          {detail && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{detail}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
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
        <Link
          href={`/playbooks/${alert.playbookId}?tab=roster`}
          className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          title="Open in playbook"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </li>
  );
}

function labelForRsvp(s: "yes" | "no" | "maybe"): string {
  return s === "yes" ? "Yes" : s === "no" ? "No" : "Maybe";
}

function RsvpRow({
  alert,
  busy,
  onRsvp,
}: {
  alert: InboxAlert;
  busy: string | null;
  onRsvp: (alert: InboxAlert, status: "yes" | "no" | "maybe") => void;
}) {
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
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-90"
      >
        <PlaybookAvatar
          name={alert.playbookName}
          logoUrl={alert.playbookLogoUrl}
          color={alert.playbookColor}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-xs font-semibold text-muted">
              {alert.playbookName}
            </span>
            <KindBadge kind={alert.kind} />
            <span className="text-[11px] text-muted-light">{startsAt}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {eventTypeLabel}: {title}
          </p>
        </div>
      </Link>
      <div
        className="flex shrink-0 items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
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
      </div>
    </li>
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
}: {
  name: string;
  logoUrl: string | null;
  color: string | null;
}) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoUrl}
        alt=""
        className="size-9 shrink-0 rounded-md object-cover"
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
      className="flex size-9 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
      style={{ backgroundColor: color ?? "#64748B" }}
    >
      {initials}
    </div>
  );
}

function KindBadge({ kind }: { kind: InboxAlertKind | ResolvedKind }) {
  const map: Record<InboxAlertKind | ResolvedKind, { label: string; cls: string }> = {
    roster_claim: { label: "claim", cls: "bg-primary/10 text-primary" },
    membership: { label: "join", cls: "bg-secondary/10 text-secondary" },
    coach_upgrade: { label: "coach", cls: "bg-warning-light text-warning" },
    rsvp_pending: { label: "rsvp", cls: "bg-success-light text-success" },
    rsvp_response: { label: "rsvp", cls: "bg-success-light text-success" },
    system_alert: { label: "billing", cls: "bg-danger-light text-danger" },
    mention: { label: "mention", cls: "bg-primary/10 text-primary" },
    share: { label: "share", cls: "bg-secondary/10 text-secondary" },
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

function NotificationRow({ alert }: { alert: InboxAlert }) {
  const title = alert.displayName?.trim() || titleForKind(alert.kind);
  const body = alert.body?.trim() || null;
  const href = alert.href || `/playbooks/${alert.playbookId}`;
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <Link href={href} className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-90">
        <PlaybookAvatar
          name={alert.playbookName}
          logoUrl={alert.playbookLogoUrl}
          color={alert.playbookColor}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-xs font-semibold text-muted">
              {alert.playbookName}
            </span>
            <KindBadge kind={alert.kind} />
            <span className="text-[11px] text-muted-light">
              {timeAgo(alert.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">{title}</p>
          {body && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{body}</p>
          )}
        </div>
      </Link>
    </li>
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
