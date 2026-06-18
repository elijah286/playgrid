"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Plus, Trash2 } from "lucide-react";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import {
  cancelReminder,
  ensureNotificationPermission,
  scheduleReminder,
} from "@/lib/native/localNotifications";
import {
  addReminder,
  loadReminders,
  removeReminder,
  type Reminder,
} from "@/lib/native/reminderStore";
import { track } from "@/lib/analytics/track";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Default the picker to the top of the next hour, in the device's local time
// (the datetime-local input wants `YYYY-MM-DDTHH:mm`).
function defaultWhen(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function RemindersClient() {
  const native = useIsNativeApp();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(defaultWhen);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReminders(loadReminders());
  }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const label = title.trim();
    if (!label) {
      setError("Add a short note, e.g. “Game vs. Hawks”.");
      return;
    }
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) {
      setError("Pick a date and time.");
      return;
    }
    if (at.getTime() <= Date.now()) {
      setError("Pick a time in the future.");
      return;
    }

    setBusy(true);
    try {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setDenied(true);
        return;
      }
      const reminder = addReminder({ title: label, at: at.toISOString() });
      await scheduleReminder({
        id: reminder.id,
        title: "XO Gridmaker",
        body: label,
        at,
      });
      setReminders(loadReminders());
      setTitle("");
      setWhen(defaultWhen());
      track({ event: "reminder_scheduled", target: "local_notification" });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    await cancelReminder(id);
    removeReminder(id);
    setReminders(loadReminders());
  }

  // On the web there's no on-device scheduler, so this is an app-only feature.
  if (!native) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
        <BellOff className="mb-2 size-5" />
        Reminders are a feature of the XO Gridmaker app — install it to get
        on-device alerts before your games and practices, even with no signal.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Bell className="size-5 text-primary" /> Reminders
        </h1>
        <p className="mt-1 text-sm text-muted">
          On-device alerts before kickoff — they fire even with no signal and
          when the app is closed.
        </p>
      </header>

      {denied && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          Notifications are turned off for XO Gridmaker. Enable them in iOS
          Settings → Notifications to get reminders.
        </div>
      )}

      <form
        onSubmit={onAdd}
        className="space-y-3 rounded-2xl border border-border bg-surface p-4"
      >
        <div>
          <label
            htmlFor="reminder-title"
            className="text-xs font-medium text-muted"
          >
            What
          </label>
          <input
            id="reminder-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Game vs. Hawks — pull up the playbook"
            className="mt-1 block box-border w-full min-w-0 max-w-full rounded-lg border border-border bg-surface-inset px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="reminder-when"
            className="text-xs font-medium text-muted"
          >
            When
          </label>
          <input
            id="reminder-when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mt-1 block box-border w-full min-w-0 max-w-full rounded-lg border border-border bg-surface-inset px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="size-4" /> {busy ? "Setting…" : "Set reminder"}
        </button>
      </form>

      {reminders.length > 0 ? (
        <ul className="space-y-2">
          {reminders.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <Bell className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="text-xs text-muted">{formatWhen(r.at)}</p>
              </div>
              <button
                type="button"
                onClick={() => void onDelete(r.id)}
                aria-label="Delete reminder"
                className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-foreground/5 hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-sm text-muted">No reminders yet.</p>
      )}
    </div>
  );
}
