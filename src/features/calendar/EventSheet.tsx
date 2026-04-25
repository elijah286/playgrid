"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { X, Trash2, Bell } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import {
  createEventAction,
  deleteEventAction,
  updateEventAction,
} from "@/app/actions/calendar";
import {
  PlaceAutocomplete,
  type SelectedPlace,
} from "@/features/calendar/PlaceAutocomplete";
import {
  EVENT_TYPE_META,
  type CalendarEventType,
} from "@/features/calendar/eventIcons";

const HOME_AWAY_LABELS: { value: "home" | "away" | "neutral"; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "neutral", label: "Neutral" },
];

const RECURRENCE_PRESETS: { value: string; label: string; rrule: string | null }[] = [
  { value: "none", label: "Does not repeat", rrule: null },
  { value: "weekly", label: "Weekly", rrule: "FREQ=WEEKLY" },
  { value: "biweekly", label: "Every 2 weeks", rrule: "FREQ=WEEKLY;INTERVAL=2" },
  { value: "monthly", label: "Monthly", rrule: "FREQ=MONTHLY" },
];

const REMINDER_PRESETS: { label: string; minutes: number }[] = [
  { label: "1 day before", minutes: 24 * 60 },
  { label: "2 hours before", minutes: 120 },
  { label: "1 hour before", minutes: 60 },
  { label: "30 min before", minutes: 30 },
];

export type EventSheetInitial = {
  id: string;
  type: CalendarEventType;
  title: string;
  startsAtIso: string;
  durationMinutes: number;
  arriveMinutesBefore: number;
  timezone: string;
  location: SelectedPlace | null;
  notes: string | null;
  opponent: string | null;
  homeAway: "home" | "away" | "neutral" | null;
  recurrenceRule: string | null;
  reminderOffsetsMinutes: number[];
};

function localDefaultTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function defaultStartLocal(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function isoFromLocalDateTime(date: string, time: string): string {
  // The browser parses "YYYY-MM-DDTHH:mm" in the user's local timezone,
  // which matches what the coach is typing. Server stores as timestamptz.
  const dt = new Date(`${date}T${time}`);
  return dt.toISOString();
}

function localDateTimeFromIso(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function EventSheet({
  open,
  onClose,
  playbookId,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  playbookId: string;
  initial?: EventSheetInitial | null;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const isEdit = Boolean(initial);
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState<CalendarEventType>(initial?.type ?? "practice");
  const [title, setTitle] = useState(initial?.title ?? "");
  const start = initial
    ? localDateTimeFromIso(initial.startsAtIso)
    : defaultStartLocal();
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [durationMinutes, setDurationMinutes] = useState(
    initial?.durationMinutes ?? 90,
  );
  const [arriveBefore, setArriveBefore] = useState(
    initial?.arriveMinutesBefore ?? 15,
  );
  const [tz] = useState(initial?.timezone ?? localDefaultTz());
  const [location, setLocation] = useState<SelectedPlace | null>(
    initial?.location ?? null,
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [opponent, setOpponent] = useState(initial?.opponent ?? "");
  const [homeAway, setHomeAway] = useState<"home" | "away" | "neutral" | null>(
    initial?.homeAway ?? null,
  );
  const [recurrence, setRecurrence] = useState<string>(() => {
    const match = RECURRENCE_PRESETS.find(
      (p) => p.rrule === (initial?.recurrenceRule ?? null),
    );
    return match?.value ?? "none";
  });
  const [reminders, setReminders] = useState<number[]>(
    initial?.reminderOffsetsMinutes ?? [24 * 60],
  );
  const [notifyAttendees, setNotifyAttendees] = useState(!isEdit);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const recurrenceRule = useMemo(
    () => RECURRENCE_PRESETS.find((p) => p.value === recurrence)?.rrule ?? null,
    [recurrence],
  );

  if (!open) return null;

  function buildPayload() {
    return {
      type,
      title: title.trim(),
      startsAt: isoFromLocalDateTime(date, time),
      durationMinutes,
      arriveMinutesBefore: arriveBefore,
      timezone: tz,
      location: location
        ? {
            name: location.name,
            address: location.address || null,
            lat: location.lat,
            lng: location.lng,
          }
        : null,
      notes: notes.trim() || null,
      opponent: type === "game" ? opponent.trim() || null : null,
      homeAway: type === "game" ? homeAway : null,
      recurrenceRule,
      reminderOffsetsMinutes: reminders,
    };
  }

  function save() {
    if (!title.trim()) {
      toast("Add a title before saving.", "error");
      return;
    }
    if (!location) {
      toast("Add a location.", "error");
      return;
    }
    startTransition(async () => {
      if (isEdit && initial) {
        const res = await updateEventAction(initial.id, {
          ...buildPayload(),
          notifyAttendees,
        });
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        toast("Event updated.", "success");
      } else {
        const res = await createEventAction(playbookId, buildPayload());
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        toast("Event created.", "success");
      }
      onSaved?.();
      onClose();
    });
  }

  function remove() {
    if (!isEdit || !initial) return;
    if (
      !globalThis.confirm(
        notifyAttendees
          ? "Delete this event and email everyone?"
          : "Delete this event? Attendees will not be notified.",
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteEventAction(initial.id, notifyAttendees);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Event deleted.", "success");
      onSaved?.();
      onClose();
    });
  }

  function toggleReminder(mins: number) {
    setReminders((cur) =>
      cur.includes(mins) ? cur.filter((m) => m !== mins) : [...cur, mins].sort((a, b) => b - a),
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit event" : "New event"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface-raised shadow-2xl ring-1 ring-border sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-foreground">
            {isEdit ? "Edit event" : "New event"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* Type chips */}
            <div className="flex gap-2" role="radiogroup" aria-label="Event type">
              {(Object.keys(EVENT_TYPE_META) as CalendarEventType[]).map((t) => {
                const meta = EVENT_TYPE_META[t];
                const Icon = meta.icon;
                const active = type === t;
                return (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={active}
                    type="button"
                    onClick={() => setType(t)}
                    className={
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium ring-1 transition " +
                      (active ? meta.chipActive : meta.chipInactive)
                    }
                  >
                    <Icon className="size-4" />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <Field label="Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === "game"
                    ? "vs. Lincoln"
                    : type === "scrimmage"
                      ? "Scrimmage vs. Hilltop"
                      : "Tuesday practice"
                }
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Start time">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration (minutes)">
                <Input
                  type="number"
                  min={1}
                  max={24 * 60}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Arrive before (minutes)">
                <Input
                  type="number"
                  min={0}
                  max={8 * 60}
                  value={arriveBefore}
                  onChange={(e) => setArriveBefore(Number(e.target.value) || 0)}
                />
              </Field>
            </div>

            <Field label="Location">
              <PlaceAutocomplete
                initial={location}
                onChange={setLocation}
                placeholder="Field, gym, or address"
              />
            </Field>

            <Field label="Repeats">
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {RECURRENCE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            {type === "game" && (
              <>
                <Field label="Opponent">
                  <Input
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                    placeholder="Lincoln High"
                  />
                </Field>
                <Field label="Home / Away">
                  <div className="flex gap-2">
                    {HOME_AWAY_LABELS.map((opt) => {
                      const active = homeAway === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setHomeAway(active ? null : opt.value)}
                          className={
                            "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition " +
                            (active
                              ? "bg-primary text-primary-foreground ring-primary"
                              : "bg-surface text-muted ring-border hover:bg-surface-inset")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </>
            )}

            <Field
              label="Reminders"
              hint="When to email everyone. Tap to toggle."
            >
              <div className="flex flex-wrap gap-2">
                {REMINDER_PRESETS.map((r) => {
                  const active = reminders.includes(r.minutes);
                  return (
                    <button
                      key={r.minutes}
                      type="button"
                      onClick={() => toggleReminder(r.minutes)}
                      className={
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition " +
                        (active
                          ? "bg-primary text-primary-foreground ring-primary"
                          : "bg-surface text-muted ring-border hover:bg-surface-inset")
                      }
                    >
                      <Bell className="size-3" />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything attendees should know?"
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </Field>

            {isEdit && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-surface-inset p-3">
                <input
                  type="checkbox"
                  checked={notifyAttendees}
                  onChange={(e) => setNotifyAttendees(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-sm text-foreground">
                  Email everyone about this change
                  <span className="block text-xs text-muted">
                    Off by default for edits — turn on for material changes like
                    time or location.
                  </span>
                </span>
              </label>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          {isEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={pending}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="mr-1 size-4" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={pending} onClick={save}>
              {isEdit ? "Save changes" : "Create event"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
