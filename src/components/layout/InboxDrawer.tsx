"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  listInboxAlertsAction,
  type InboxAlert,
  type InboxAlertKind,
} from "@/app/actions/inbox";

/**
 * Cross-playbook inbox drawer. Triggered by `InboxBell`. Lists every
 * active alert the coach has — grouped by source playbook so they can
 * tell at a glance which team an item belongs to. Tapping a row jumps
 * to the full inbox (the per-kind action UIs live there; this is a
 * surface for awareness + a launchpad, not a full replacement).
 *
 * Layout: full-width bottom sheet on mobile (fills the gesture area
 * the rest of the playbook header doesn't cover), positioned popover
 * below the bell on desktop. The full alerts payload is fetched lazily
 * on open — the badge baseline already gave us the count, no reason to
 * hold the full list in memory until the coach actually wants it.
 */
export function InboxDrawer({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; alerts: InboxAlert[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listInboxAlertsAction();
      if (cancelled) return;
      if (!res.ok) {
        setState({ kind: "error", message: res.error });
        return;
      }
      const active = res.alerts.filter((a) => a.status === "active");
      setState({ kind: "ready", alerts: active });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    if (state.kind !== "ready") return [];
    return groupByPlaybook(state.alerts);
  }, [state]);

  return (
    <>
      {/* Mobile-only backdrop. Desktop popover uses the InboxBell's
          outside-click handler instead — a full-screen backdrop on a
          desktop dropdown is overkill and breaks two-pane workflows
          where the coach might want to scan the drawer while keeping
          the page beneath visible. */}
      <button
        type="button"
        aria-label="Close inbox"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 sm:hidden"
      />
      <div
        role="dialog"
        aria-label="Inbox"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-surface-raised shadow-elevated sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:z-50 sm:mt-2 sm:max-h-[70vh] sm:w-[22rem] sm:rounded-2xl sm:border"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Inbox</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              Items needing your attention, across every playbook.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {state.kind === "loading" && (
            <div className="flex items-center justify-center px-4 py-8 text-xs text-muted">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading…
            </div>
          )}
          {state.kind === "error" && (
            <div className="px-4 py-6 text-center text-xs text-danger">
              Couldn&rsquo;t load inbox: {state.message}
            </div>
          )}
          {state.kind === "ready" && groups.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-muted">
              You&rsquo;re all caught up.
            </div>
          )}
          {state.kind === "ready" &&
            groups.map((group) => (
              <PlaybookGroup key={group.playbookId} group={group} onClose={onClose} />
            ))}
        </div>

        <Link
          href="/home?tab=inbox"
          onClick={onClose}
          className="flex items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3 text-xs font-semibold text-primary hover:bg-surface-inset"
        >
          <span>Open full inbox</span>
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </>
  );
}

type PlaybookAlertGroup = {
  playbookId: string;
  playbookName: string;
  playbookLogoUrl: string | null;
  playbookColor: string | null;
  alerts: InboxAlert[];
};

function groupByPlaybook(alerts: InboxAlert[]): PlaybookAlertGroup[] {
  const byId = new Map<string, PlaybookAlertGroup>();
  for (const a of alerts) {
    const existing = byId.get(a.playbookId);
    if (existing) {
      existing.alerts.push(a);
      continue;
    }
    byId.set(a.playbookId, {
      playbookId: a.playbookId,
      playbookName: a.playbookName,
      playbookLogoUrl: a.playbookLogoUrl,
      playbookColor: a.playbookColor,
      alerts: [a],
    });
  }
  // Render groups ordered by their newest alert so the freshest
  // playbook always comes first — matches the coach's mental model
  // ("what just happened?"). Within a group, alerts come back from
  // listInboxAlertsAction already newest-first.
  return [...byId.values()].sort((a, b) => {
    const aT = a.alerts[0]?.createdAt ?? "";
    const bT = b.alerts[0]?.createdAt ?? "";
    return bT.localeCompare(aT);
  });
}

function PlaybookGroup({
  group,
  onClose,
}: {
  group: PlaybookAlertGroup;
  onClose: () => void;
}) {
  const accentColor = group.playbookColor || "#F26522";
  const initial = group.playbookName.trim().charAt(0).toUpperCase();
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 bg-surface px-4 py-2">
        <div
          className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded text-[10px] font-extrabold text-white ring-1 ring-black/10"
          style={{ backgroundColor: accentColor }}
        >
          {group.playbookLogoUrl ? (
            <Image
              src={group.playbookLogoUrl}
              alt=""
              fill
              className="object-contain p-0.5"
              sizes="20px"
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <Link
          href={`/playbooks/${group.playbookId}`}
          onClick={onClose}
          className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-foreground"
        >
          {group.playbookName}
        </Link>
      </div>
      <ul>
        {group.alerts.map((alert) => (
          <li key={alert.key}>
            <AlertRow alert={alert} onClose={onClose} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlertRow({
  alert,
  onClose,
}: {
  alert: InboxAlert;
  onClose: () => void;
}) {
  const Icon = iconForKind(alert.kind);
  const summary = summaryForAlert(alert);
  const time = formatRelativeTime(alert.createdAt);
  return (
    <Link
      href={hrefForAlert(alert)}
      onClick={onClose}
      className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-inset"
    >
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-inset text-muted">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">
          {summary}
        </span>
        {time && (
          <span className="mt-0.5 block text-[11px] text-muted">{time}</span>
        )}
      </span>
    </Link>
  );
}

function iconForKind(kind: InboxAlertKind) {
  switch (kind) {
    case "membership":
      return Users;
    case "coach_upgrade":
      return UserPlus;
    case "roster_claim":
      return UserPlus;
    case "rsvp_pending":
      return Calendar;
    case "system_alert":
      return AlertTriangle;
    case "mention":
      return MessageSquare;
    case "share":
      return Send;
    case "admin_notice":
      return Shield;
  }
}

function summaryForAlert(a: InboxAlert): string {
  const who = a.displayName?.trim() || "Someone";
  switch (a.kind) {
    case "membership":
      return `${who} wants to join`;
    case "coach_upgrade":
      return `${who} requested editor access`;
    case "roster_claim":
      return `${who} claimed a roster spot${a.rosterLabel ? ` (${a.rosterLabel})` : ""}`;
    case "rsvp_pending":
      return a.eventTitle
        ? `RSVP needed: ${a.eventTitle}`
        : "RSVP needed";
    case "system_alert":
      return a.body || "System alert";
    case "mention":
      return a.body || `${who} mentioned you`;
    case "share":
      return a.body || `${who} shared a play`;
    case "admin_notice":
      return a.body || "Admin notice";
  }
}

function hrefForAlert(a: InboxAlert): string {
  // Calendar items deep-link straight to the event so the coach can
  // RSVP without bouncing through the lobby. Everything else lands on
  // the full inbox where the per-kind action UI lives.
  if (a.kind === "rsvp_pending" && a.eventId) {
    return `/playbooks/${a.playbookId}/calendar?event=${a.eventId}`;
  }
  if (a.href) return a.href;
  return "/home?tab=inbox";
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
