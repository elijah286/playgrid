"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Megaphone,
  Send,
  UserPlus,
  Users,
} from "lucide-react";
import { ApprovalControls, approvalFor } from "./ApprovalControls";

export type AlertItem = {
  key: string;
  kind: string;
  playbookId: string;
  playbookName: string;
  playbookColor: string | null;
  eventTitle: string | null;
  who: string | null;
  body: string | null;
  href: string | null;
  userId: string | null;
  claimId: string | null;
};

export type ActivityItem = {
  id: string;
  kind: "play_update" | "member_joined";
  playbookId: string;
  playbookName: string;
  playbookColor: string | null;
  actor: string | null;
  occurredAt: string;
  playId: string | null;
  playName: string | null;
};

const FALLBACK = "#64748B";

function alertText(a: AlertItem): string {
  const who = a.who?.trim() || "Someone";
  switch (a.kind) {
    case "rsvp_pending":
      return a.eventTitle ? `RSVP needed: ${a.eventTitle}` : "RSVP needed";
    case "membership":
      return `${who} wants to join`;
    case "coach_upgrade":
      return `${who} requested coach access`;
    case "roster_claim":
      return `${who} claimed a roster spot`;
    case "share":
      return a.body || `${who} shared a playbook`;
    default:
      return a.body || "Needs your attention";
  }
}

function alertIcon(kind: string) {
  switch (kind) {
    case "rsvp_pending":
      return Calendar;
    case "share":
      return Send;
    default:
      return UserPlus;
  }
}

function alertHref(a: AlertItem): string {
  switch (a.kind) {
    case "rsvp_pending":
      return "/app/schedule";
    case "membership":
    case "coach_upgrade":
    case "roster_claim":
      // Fallback only — these normally render inline approve/deny. Stay in the
      // shell rather than dumping to the production /playbooks roster tab.
      return "/app/team/roster";
    default:
      return a.href || "/app/alerts";
  }
}

function activityText(a: ActivityItem): string {
  const actor = a.actor?.trim() || "Someone";
  if (a.kind === "play_update") return `${actor} updated ${a.playName || "a play"}`;
  return `${actor} joined`;
}

function activityHref(a: ActivityItem): string {
  if (a.kind === "play_update" && a.playId) return `/plays/${a.playId}/edit`;
  if (a.kind === "member_joined") return "/app/team/roster";
  return "/app/team";
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AlertsClient({
  needsYou,
  activity,
  scoped,
}: {
  needsYou: AlertItem[];
  activity: ActivityItem[];
  scoped: boolean;
}) {
  const [tab, setTab] = useState<"needs" | "activity">("needs");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-foreground">Alerts</h1>

      <div className="flex gap-2">
        <Tab active={tab === "needs"} onClick={() => setTab("needs")} label={`Needs you${needsYou.length ? ` · ${needsYou.length}` : ""}`} />
        <Tab active={tab === "activity"} onClick={() => setTab("activity")} label="Activity" />
      </div>

      {tab === "needs" ? (
        needsYou.length === 0 ? (
          <Empty text="You're all caught up." />
        ) : (
          <ul className="space-y-2">
            {needsYou.map((a) => {
              const Icon = alertIcon(a.kind);
              const color = a.playbookColor || FALLBACK;
              const pair = approvalFor(a.kind, a.playbookId, a.userId, a.claimId);
              const body = (
                <>
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-warning-light text-warning">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{alertText(a)}</span>
                    {!scoped && (
                      <span
                        className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {a.playbookName}
                      </span>
                    )}
                  </span>
                </>
              );
              return (
                <li key={a.key}>
                  {pair ? (
                    // Actionable inline — approve/deny without leaving the shell.
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3 shadow-sm">
                      {body}
                      <ApprovalControls pair={pair} />
                    </div>
                  ) : (
                    <Link
                      href={alertHref(a)}
                      className="flex items-start gap-3 rounded-xl border border-border bg-surface-raised p-3 shadow-sm transition-colors hover:bg-surface-inset"
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : activity.length === 0 ? (
        <Empty text="No recent activity." />
      ) : (
        <ul className="space-y-2">
          {activity.map((a) => {
            const color = a.playbookColor || FALLBACK;
            const Icon = a.kind === "member_joined" ? Users : Megaphone;
            return (
              <li key={a.id}>
                <Link
                  href={activityHref(a)}
                  className="flex items-start gap-3 rounded-xl border border-border bg-surface-raised p-3 shadow-sm transition-colors hover:bg-surface-inset"
                >
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-inset text-muted">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-foreground">{activityText(a)}</span>
                      <span className="shrink-0 text-[11px] text-muted">{relTime(a.occurredAt)}</span>
                    </span>
                    {!scoped && (
                      <span
                        className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {a.playbookName}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors ${
        active ? "border-foreground bg-foreground text-white" : "border-border bg-surface-raised text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
      {text}
    </p>
  );
}
