"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowUpRight, Check, Inbox, X } from "lucide-react";
import {
  approveCoachUpgradeAction,
  approveMemberAction,
  approveRosterClaimAction,
  denyCoachUpgradeAction,
  denyMemberAction,
  rejectRosterClaimAction,
} from "@/app/actions/playbook-roster";
import type { InboxAlert, InboxAlertKind } from "@/app/actions/inbox";
import { Button, SegmentedControl, useToast } from "@/components/ui";

type SortMode = "newest" | "oldest" | "playbook";
type FilterKind = "all" | InboxAlertKind;

export function InboxTab({ initialAlerts }: { initialAlerts: InboxAlert[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<InboxAlert[]>(initialAlerts);
  const [busy, setBusy] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("newest");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c = { all: alerts.length, membership: 0, coach_upgrade: 0, roster_claim: 0 };
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

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center">
        <Inbox className="mx-auto size-8 text-muted" />
        <h2 className="mt-3 text-base font-bold text-foreground">
          You're all caught up
        </h2>
        <p className="mt-1 text-sm text-muted">
          Nothing waiting on you right now. New player claims and join requests
          will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">
            Needs your attention
          </h2>
          <p className="text-xs text-muted">
            {alerts.length} item{alerts.length === 1 ? "" : "s"} waiting across your
            playbooks.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
          count={counts.all}
        />
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
          />
        ))}
      </ul>
    </div>
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
}: {
  alert: InboxAlert;
  busy: string | null;
  onAct: (
    alert: InboxAlert,
    op: "approve" | "reject",
    busyKey: string,
    okMsg: string,
  ) => void;
}) {
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
