"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Megaphone,
  Settings,
  UserPlus,
} from "lucide-react";
import type { ActivityEntry } from "@/app/actions/activity";
import { Button, Modal, useToast } from "@/components/ui";
import {
  listDigestPlaybooksAction,
  updateDigestPrefsAction,
  type DigestPlaybookPref,
} from "@/app/actions/digest-prefs";

export function ActivityTab({ entries }: { entries: ActivityEntry[] }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("settings") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep-link from email
      setSettingsOpen(true);
    }
  }, []);
  if (entries.length === 0) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <Activity className="mx-auto size-8 text-muted" />
          <h2 className="mt-3 text-base font-bold text-foreground">
            Nothing here yet
          </h2>
          <p className="mt-1 text-sm text-muted">
            Coach broadcasts and new teammates joining will show up here.
          </p>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground"
          >
            <Bell className="size-3.5" />
            Manage daily digest emails
          </button>
        </div>
        {settingsOpen && (
          <DigestSettingsModal onClose={() => setSettingsOpen(false)} />
        )}
      </>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">Activity</h2>
          <p className="text-xs text-muted">
            Recent updates from your playbooks. No action needed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-inset hover:text-foreground"
          title="Daily digest email settings"
        >
          <Settings className="size-3.5" />
          Email settings
        </button>
      </div>
      {settingsOpen && (
        <DigestSettingsModal onClose={() => setSettingsOpen(false)} />
      )}
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
