"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowUpRight,
  Calendar,
  Check,
  HelpCircle,
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
} from "@/app/actions/inbox";
import type { ActivityEntry } from "@/app/actions/activity";
import {
  listDigestPlaybooksAction,
  updateDigestPrefsAction,
  type DigestPlaybookPref,
} from "@/app/actions/digest-prefs";
import { Button, Modal, SegmentedControl, useToast } from "@/components/ui";

type SortMode = "newest" | "oldest" | "playbook";
type FilterKind = "all" | InboxAlertKind;
type ViewMode = "pending" | "resolved";

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
  const [sort, setSort] = useState<SortMode>("newest");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [view, setView] = useState<ViewMode>("pending");
  const [resolved, setResolved] = useState<ResolvedInboxEvent[] | null>(null);
  const [resolvedLoading, setResolvedLoading] = useState(false);
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
    const c = {
      all: alerts.length,
      membership: 0,
      coach_upgrade: 0,
      roster_claim: 0,
      rsvp_pending: 0,
    };
    for (const a of alerts) c[a.kind] += 1;
    return c;
  }, [alerts]);

  const visible = useMemo(() => {
    const filtered =
      filter === "all" ? alerts : alerts.filter((a) => a.kind === filter);
    const sorted = [...filtered];
    if (sort === "newest") {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sort === "oldest") {
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else {
      sorted.sort(
        (a, b) =>
          a.playbookName.localeCompare(b.playbookName) ||
          b.createdAt.localeCompare(a.createdAt),
      );
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
                { value: "newest", label: "Newest" },
                { value: "oldest", label: "Oldest" },
                { value: "playbook", label: "By playbook" },
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
              {counts.rsvp_pending > 0 && (
                <FilterChip
                  active={filter === "rsvp_pending"}
                  onClick={() => setFilter("rsvp_pending")}
                  label="RSVPs"
                  count={counts.rsvp_pending}
                />
              )}
              {counts.roster_claim > 0 && (
                <FilterChip
                  active={filter === "roster_claim"}
                  onClick={() => setFilter("roster_claim")}
                  label="Player claims"
                  count={counts.roster_claim}
                />
              )}
              {counts.membership > 0 && (
                <FilterChip
                  active={filter === "membership"}
                  onClick={() => setFilter("membership")}
                  label="Join requests"
                  count={counts.membership}
                />
              )}
              {counts.coach_upgrade > 0 && (
                <FilterChip
                  active={filter === "coach_upgrade"}
                  onClick={() => setFilter("coach_upgrade")}
                  label="Coach requests"
                  count={counts.coach_upgrade}
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
        <ResolvedList loading={resolvedLoading} events={resolved ?? []} />
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
}: {
  loading: boolean;
  events: ResolvedInboxEvent[];
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center text-sm text-muted">
        Loading history…
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center">
        <Inbox className="mx-auto size-8 text-muted" />
        <h2 className="mt-3 text-base font-bold text-foreground">
          No resolved items yet
        </h2>
        <p className="mt-1 text-sm text-muted">
          Once you approve or reject a request, it'll show up here.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {events.map((e) => (
        <ResolvedRow key={e.id} event={e} />
      ))}
    </ul>
  );
}

function ResolvedRow({ event }: { event: ResolvedInboxEvent }) {
  const name = event.subjectDisplayName?.trim() || "Unnamed";
  const approved = event.action === "approved";
  let title: string;
  if (event.kind === "roster_claim") {
    const slot = event.detail.rosterLabel?.trim() || "an unclaimed roster spot";
    const jersey = event.detail.jerseyNumber?.trim();
    title = approved
      ? `Linked ${name} to ${slot}${jersey ? ` (#${jersey})` : ""}`
      : `Rejected ${name}'s claim on ${slot}${jersey ? ` (#${jersey})` : ""}`;
  } else if (event.kind === "coach_upgrade") {
    title = approved
      ? `Granted coach access to ${name}`
      : `Denied coach request from ${name}`;
  } else {
    const role = event.detail.role ?? "viewer";
    title = approved
      ? `Approved ${name} as ${role}`
      : `Rejected ${name}'s request to join as ${role}`;
  }
  const byName = event.resolvedByDisplayName?.trim();
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
              href={`/playbooks/${event.playbookId}?tab=roster`}
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
          {byName && (
            <p className="mt-0.5 text-xs text-muted">by {byName}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={`/playbooks/${event.playbookId}?tab=roster`}
          className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          title="Open in playbook"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </li>
  );
}

function ResolutionBadge({ action }: { action: "approved" | "rejected" }) {
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
  const yesKey = `rsvp:yes:${alert.key}`;
  const noKey = `rsvp:no:${alert.key}`;
  const maybeKey = `rsvp:maybe:${alert.key}`;
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
              href={`/playbooks/${alert.playbookId}?tab=calendar`}
              className="truncate text-xs font-semibold text-muted hover:text-foreground hover:underline"
            >
              {alert.playbookName}
            </Link>
            <KindBadge kind={alert.kind} />
            <span className="text-[11px] text-muted-light">{startsAt}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {eventTypeLabel}: {title}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          variant="primary"
          leftIcon={Check}
          disabled={busy !== null}
          onClick={() => onRsvp(alert, "yes")}
        >
          {busy === yesKey ? "…" : "Yes"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={HelpCircle}
          disabled={busy !== null}
          onClick={() => onRsvp(alert, "maybe")}
        >
          {busy === maybeKey ? "…" : "Maybe"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={X}
          disabled={busy !== null}
          onClick={() => onRsvp(alert, "no")}
        >
          {busy === noKey ? "…" : "No"}
        </Button>
        <Link
          href={`/playbooks/${alert.playbookId}?tab=calendar`}
          className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          title="Open in calendar"
        >
          <Calendar className="size-4" />
        </Link>
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

function KindBadge({ kind }: { kind: InboxAlertKind }) {
  const map: Record<InboxAlertKind, { label: string; cls: string }> = {
    roster_claim: { label: "claim", cls: "bg-primary/10 text-primary" },
    membership: { label: "join", cls: "bg-secondary/10 text-secondary" },
    coach_upgrade: { label: "coach", cls: "bg-warning-light text-warning" },
    rsvp_pending: { label: "rsvp", cls: "bg-success-light text-success" },
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
