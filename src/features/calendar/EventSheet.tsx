"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { X, Trash2, Bell, Repeat } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import {
  createEventAction,
  deleteEventAction,
  deleteEventOccurrenceAction,
  updateEventAction,
  updateEventOccurrenceAction,
} from "@/app/actions/calendar";
import {
  PlaceAutocomplete,
  type SelectedPlace,
} from "@/features/calendar/PlaceAutocomplete";
import { LocationMap } from "@/features/calendar/LocationMap";
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

const OTHER_TITLE_SUGGESTIONS = [
  "Team party",
  "Booster club meeting",
  "Film session",
  "Team meeting",
  "Tournament",
  "Fundraiser",
];

function deriveTitle(
  type: CalendarEventType,
  customTitle: string,
  opponent: string,
): string {
  switch (type) {
    case "practice":
      return "Practice";
    case "game": {
      const o = opponent.trim();
      return o ? `vs. ${o}` : "Game";
    }
    case "scrimmage": {
      const o = opponent.trim();
      return o ? `Scrimmage vs. ${o}` : "Scrimmage";
    }
    case "other":
      return customTitle.trim();
  }
}

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
  /** YYYY-MM-DD of the occurrence the user clicked. Required for recurring
   *  events so "edit this / following / all" can target the right instance. */
  occurrenceDate?: string;
};

type RecurrenceScope = "this" | "following" | "all";

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
  const isRecurring = Boolean(initial?.recurrenceRule);
  const [pending, startTransition] = useTransition();
  const [scopePrompt, setScopePrompt] = useState<null | "save" | "delete">(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // If editing an existing event whose stored title isn't the canonical
  // derived one (e.g. legacy events typed "Practice 5/30"), open it as
  // "Other" so the coach keeps their custom wording.
  const [type, setType] = useState<CalendarEventType>(() => {
    const t = initial?.type ?? "practice";
    if (!initial) return t;
    const derived = deriveTitle(t, initial.title ?? "", initial.opponent ?? "");
    return derived === (initial.title ?? "") ? t : "other";
  });
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
    const raw = initial?.recurrenceRule ?? null;
    if (!raw) return "none";
    const base = raw
      .split(";")
      .filter((p) => !p.toUpperCase().startsWith("UNTIL="))
      .join(";");
    const match = RECURRENCE_PRESETS.find((p) => p.rrule === base);
    return match?.value ?? "none";
  });
  // Recurring events must end. Default to 12 weeks out so the coach has a
  // sensible starting point — they can extend before saving.
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>(() => {
    const raw = initial?.recurrenceRule ?? null;
    if (raw) {
      const untilPart = raw
        .split(";")
        .find((p) => p.toUpperCase().startsWith("UNTIL="));
      if (untilPart) {
        const stamp = untilPart.slice(6); // YYYYMMDDTHHMMSSZ
        const m = stamp.match(/^(\d{4})(\d{2})(\d{2})/);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      }
    }
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 12 * 7);
    return `${fallback.getFullYear()}-${pad(fallback.getMonth() + 1)}-${pad(fallback.getDate())}`;
  });
  const [reminders, setReminders] = useState<number[]>(
    initial?.reminderOffsetsMinutes ?? [24 * 60],
  );
  // Default ON for both create and edit. When a coach reschedules or
  // cancels, the team needs to know — silent edits are the exception, not
  // the rule. The coach can untick for trivial copy fixes.
  const [notifyAttendees, setNotifyAttendees] = useState(true);

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

  const recurrenceRule = useMemo(() => {
    const base = RECURRENCE_PRESETS.find((p) => p.value === recurrence)?.rrule ?? null;
    if (!base) return null;
    // Encode UNTIL as end-of-day UTC on the chosen date so the last
    // occurrence on that date is included.
    const [y, mo, d] = recurrenceEndDate.split("-").map(Number);
    if (!y || !mo || !d) return base;
    const untilStamp =
      `${y}${String(mo).padStart(2, "0")}${String(d).padStart(2, "0")}T235959Z`;
    return `${base};UNTIL=${untilStamp}`;
  }, [recurrence, recurrenceEndDate]);

  if (!open) return null;

  function buildPayload() {
    return {
      type,
      title: deriveTitle(type, title, opponent),
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
    if (type === "other" && !title.trim()) {
      toast("Give this event a title.", "error");
      return;
    }
    if (!location) {
      toast("Add a location.", "error");
      return;
    }
    if (recurrence !== "none") {
      if (!recurrenceEndDate) {
        toast("Pick an end date for the repeating series.", "error");
        return;
      }
      if (new Date(`${recurrenceEndDate}T23:59:59`) < new Date(`${date}T${time}`)) {
        toast("End date must be on or after the first occurrence.", "error");
        return;
      }
    }
    if (isEdit && isRecurring && initial?.occurrenceDate) {
      setScopePrompt("save");
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
    if (isRecurring && initial.occurrenceDate) {
      setScopePrompt("delete");
      return;
    }
    setDeleteConfirm(true);
  }

  function confirmDelete(notify: boolean) {
    if (!isEdit || !initial) return;
    setDeleteConfirm(false);
    startTransition(async () => {
      const res = await deleteEventAction(initial.id, notify);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Event deleted.", "success");
      onSaved?.();
      onClose();
    });
  }

  function applyScope(scope: RecurrenceScope) {
    if (!initial?.occurrenceDate) return;
    const occurrenceDate = initial.occurrenceDate;
    const action = scopePrompt;
    setScopePrompt(null);
    startTransition(async () => {
      if (action === "save") {
        const res = await updateEventOccurrenceAction(initial.id, {
          ...buildPayload(),
          notifyAttendees,
          occurrenceDate,
          scope,
        });
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        toast("Event updated.", "success");
      } else if (action === "delete") {
        const res = await deleteEventOccurrenceAction(initial.id, {
          occurrenceDate,
          scope,
          notifyAttendees,
        });
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
        toast("Event deleted.", "success");
      }
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

            {type === "other" && (
              <Field label="Title">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Team party, booster meeting, …"
                  autoFocus
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {OTHER_TITLE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTitle(s)}
                      className="rounded-full bg-surface px-2.5 py-1 text-xs text-muted ring-1 ring-border hover:bg-surface-inset hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
            )}

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
              {location?.lat != null && location?.lng != null && (
                <div className="mt-2 space-y-1">
                  <LocationMap
                    lat={location.lat}
                    lng={location.lng}
                    onChange={({ lat, lng }) =>
                      setLocation({
                        ...location,
                        // Manual nudge — drop the placeId so we don't re-render
                        // the original venue's coordinates.
                        placeId: null,
                        lat,
                        lng,
                      })
                    }
                  />
                  <p className="px-1 text-xs text-muted">
                    Pan the map to position the pin on the exact spot.
                  </p>
                </div>
              )}
            </Field>

            <Field
              label="Repeats"
              hint="Pick a cadence to create a recurring series."
            >
              <div className="flex flex-wrap gap-2">
                {RECURRENCE_PRESETS.map((p) => {
                  const active = recurrence === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setRecurrence(p.value)}
                      className={
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition " +
                        (active
                          ? "bg-primary text-primary-foreground ring-primary"
                          : "bg-surface text-muted ring-border hover:bg-surface-inset")
                      }
                    >
                      <Repeat className="size-3" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
              {recurrence !== "none" && (
                <div className="mt-2">
                  <span className="mb-1 block text-xs font-medium text-foreground">
                    Ends on
                  </span>
                  <Input
                    type="date"
                    value={recurrenceEndDate}
                    min={date}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    required
                  />
                  <span className="mt-1 block text-xs text-muted">
                    Required — the last occurrence will be on or before this date.
                  </span>
                </div>
              )}
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
                    On by default. Sends right away to every member of this
                    playbook so reschedules and cancellations don&apos;t get
                    missed. Untick only for tiny edits (typo fixes, notes).
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

      {scopePrompt && (
        <ScopePromptDialog
          mode={scopePrompt}
          pending={pending}
          onCancel={() => setScopePrompt(null)}
          onChoose={applyScope}
        />
      )}

      {deleteConfirm && (
        <DeleteConfirmDialog
          pending={pending}
          onCancel={() => setDeleteConfirm(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function DeleteConfirmDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: (notify: boolean) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-surface p-5 shadow-xl ring-1 ring-border sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">
          Delete this event?
        </h2>
        <p className="mt-1 text-xs text-muted">
          This can&apos;t be undone. Choose whether to let the team know.
        </p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm(true)}
            className="w-full rounded-lg bg-danger px-3 py-2.5 text-left text-sm font-medium text-white ring-1 ring-danger hover:bg-danger/90 disabled:opacity-60"
          >
            Delete & notify everyone
            <span className="block text-xs font-normal text-white/80">
              Emails the playbook so nobody shows up to a cancelled event.
            </span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm(false)}
            className="w-full rounded-lg bg-surface px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border hover:bg-surface-hover disabled:opacity-60"
          >
            Delete without notifying
            <span className="block text-xs font-normal text-muted">
              Use for mistakes or duplicates the team never saw.
            </span>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScopePromptDialog({
  mode,
  pending,
  onCancel,
  onChoose,
}: {
  mode: "save" | "delete";
  pending: boolean;
  onCancel: () => void;
  onChoose: (scope: RecurrenceScope) => void;
}) {
  const verb = mode === "save" ? "Save" : "Delete";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-surface p-5 shadow-xl ring-1 ring-border sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">
          {verb} which events?
        </h2>
        <p className="mt-1 text-xs text-muted">
          This is a recurring event. Pick the scope of your change.
        </p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onChoose("this")}
            className="w-full rounded-lg bg-surface px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border hover:bg-surface-hover disabled:opacity-60"
          >
            {verb} this event only
            <span className="block text-xs font-normal text-muted">
              Other occurrences stay as scheduled.
            </span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onChoose("following")}
            className="w-full rounded-lg bg-surface px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border hover:bg-surface-hover disabled:opacity-60"
          >
            {verb} this and all following
            <span className="block text-xs font-normal text-muted">
              Past occurrences are kept untouched.
            </span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onChoose("all")}
            className="w-full rounded-lg bg-surface px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border hover:bg-surface-hover disabled:opacity-60"
          >
            {verb} all events in the series
            <span className="block text-xs font-normal text-muted">
              Applies to every occurrence, past and future.
            </span>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
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
