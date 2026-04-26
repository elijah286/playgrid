"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarPlus,
  Calendar,
  ChevronDown,
  MapPin,
  X,
} from "lucide-react";
import { Button, useToast } from "@/components/ui";
import {
  listMyCoachablePlaybooksAction,
  listUpcomingEventsAcrossPlaybooksAction,
  setRsvpAction,
  type CoachablePlaybookRow,
  type CrossPlaybookEventRow,
} from "@/app/actions/calendar";
import { EVENT_TYPE_META } from "./eventIcons";
import { EventSheet } from "./EventSheet";
import { MonthGrid, ymd } from "./MonthGrid";
import { WeekAgenda } from "./WeekAgenda";

type ViewKind = "list" | "week" | "month";

const FALLBACK_PLAYBOOK_COLOR = "#64748B";

export function HomeCalendarTab({
  onPendingChange,
}: {
  onPendingChange?: (pending: number) => void;
} = {}) {
  const [events, setEvents] = useState<CrossPlaybookEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKind>("list");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coachablePlaybooks, setCoachablePlaybooks] = useState<
    CoachablePlaybookRow[] | null
  >(null);
  const [sheetPlaybookId, setSheetPlaybookId] = useState<string | null>(null);
  const [needsRsvpExpanded, setNeedsRsvpExpanded] = useState(true);

  function load() {
    listUpcomingEventsAcrossPlaybooksAction().then((res) => {
      if (res.ok) {
        setEvents(res.events);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (
      pickerOpen &&
      coachablePlaybooks !== null &&
      coachablePlaybooks.length === 1
    ) {
      setPickerOpen(false);
      setSheetPlaybookId(coachablePlaybooks[0]!.id);
    }
  }, [pickerOpen, coachablePlaybooks]);

  function openPicker() {
    setPickerOpen(true);
    if (coachablePlaybooks === null) {
      listMyCoachablePlaybooksAction().then((res) => {
        if (res.ok) setCoachablePlaybooks(res.playbooks);
        else setCoachablePlaybooks([]);
      });
    }
  }

  function pickPlaybook(p: CoachablePlaybookRow) {
    setPickerOpen(false);
    setSheetPlaybookId(p.id);
  }

  const needsRsvp = useMemo(
    () => events.filter((e) => e.myRsvp == null),
    [events],
  );

  useEffect(() => {
    onPendingChange?.(needsRsvp.length);
  }, [needsRsvp.length, onPendingChange]);

  const visible = useMemo(() => {
    if (view === "month" && selectedDayKey) {
      return events.filter(
        (e) => (e.occurrenceDate || ymd(new Date(e.startsAt))) === selectedDayKey,
      );
    }
    return events;
  }, [view, selectedDayKey, events]);

  if (loading) {
    return <p className="py-12 text-center text-sm text-muted">Loading events…</p>;
  }
  if (error) {
    return (
      <p className="py-12 text-center text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }

  const empty = events.length === 0;
  const isAutoPicking =
    pickerOpen &&
    coachablePlaybooks !== null &&
    coachablePlaybooks.length === 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-border">
          {(["list", "week", "month"] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  if (v !== "month") setSelectedDayKey(null);
                }}
                className={
                  "px-3 py-1.5 text-sm font-medium capitalize transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-foreground hover:bg-surface-hover")
                }
              >
                {v}
              </button>
            );
          })}
        </div>
        <Button variant="primary" size="sm" onClick={openPicker}>
          <CalendarPlus className="mr-1.5 size-4" />
          New event
        </Button>
      </div>

      {empty && (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <Calendar className="mx-auto mb-2 size-8 text-muted" />
          <p className="text-sm font-medium text-foreground">No upcoming events</p>
          <p className="mt-1 text-xs text-muted">
            Schedule a practice, game, or scrimmage with “New event.”
          </p>
        </div>
      )}

      {!empty && view === "month" && (
        <MonthGrid
          events={events}
          selectedDayKey={selectedDayKey}
          onSelectDay={(d) => setSelectedDayKey(d ? ymd(d) : null)}
        />
      )}

      {!empty && view === "week" && (
        <WeekAgenda
          events={events}
          renderEvent={(e) => (
            <Link
              href={`/playbooks/${e.playbookId}?tab=calendar`}
              className="block"
            >
              <CrossPlaybookCompact event={e} />
            </Link>
          )}
        />
      )}

      {!empty && view === "list" && needsRsvp.length > 0 && (
        <NeedsRsvpCard
          events={needsRsvp}
          expanded={needsRsvpExpanded}
          onToggle={() => setNeedsRsvpExpanded((v) => !v)}
          onChanged={load}
        />
      )}

      {!empty && (view === "list" || (view === "month" && selectedDayKey)) && (
        <ul className="space-y-2">
          {visible.map((e) => (
            <EventRow
              key={`${e.id}:${e.occurrenceDate}`}
              event={e}
              onChanged={load}
            />
          ))}
          {view === "month" && selectedDayKey && visible.length === 0 && (
            <li className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-xs text-muted">
              No events on this day.
            </li>
          )}
        </ul>
      )}

      {pickerOpen && !isAutoPicking && (
        <PlaybookPickerModal
          playbooks={coachablePlaybooks}
          onPick={pickPlaybook}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {sheetPlaybookId && (
        <EventSheet
          open={true}
          onClose={() => setSheetPlaybookId(null)}
          playbookId={sheetPlaybookId}
          initial={null}
          onSaved={() => {
            setSheetPlaybookId(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PlaybookPickerModal({
  playbooks,
  onPick,
  onClose,
}: {
  playbooks: CoachablePlaybookRow[] | null;
  onPick: (p: CoachablePlaybookRow) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface-raised p-4 shadow-xl ring-1 ring-border sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Pick a team
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        {playbooks === null && (
          <p className="py-6 text-center text-sm text-muted">Loading…</p>
        )}
        {playbooks !== null && playbooks.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            You aren&rsquo;t a coach in any playbook yet.
          </p>
        )}
        {playbooks !== null && playbooks.length > 0 && (
          <ul className="space-y-1.5">
            {playbooks.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left ring-1 ring-border transition-colors hover:bg-surface-hover"
                >
                  <span
                    className="size-5 shrink-0 rounded"
                    style={{
                      backgroundColor: p.color ?? FALLBACK_PLAYBOOK_COLOR,
                    }}
                  />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {p.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function relativeDayLabel(start: Date): string | null {
  const startDay = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const today = new Date();
  const todayDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const diffDays = Math.round(
    (startDay.getTime() - todayDay.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`;
  return null;
}

function CrossPlaybookCompact({ event }: { event: CrossPlaybookEventRow }) {
  const meta = EVENT_TYPE_META[event.type];
  const Icon = meta.icon;
  const time = new Date(event.startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const color = event.playbookColor ?? FALLBACK_PLAYBOOK_COLOR;
  return (
    <div
      className="flex items-center gap-2 rounded-lg border-l-4 bg-surface-inset px-2 py-1.5 text-xs hover:bg-surface-hover"
      style={{ borderLeftColor: color }}
    >
      <span
        className={
          "inline-flex size-6 shrink-0 items-center justify-center rounded ring-1 " +
          meta.chipActive
        }
      >
        <Icon className="size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{event.title}</p>
        <p className="flex items-center gap-1 truncate text-[10px] text-muted">
          <span
            className="inline-block size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="truncate">{event.playbookName}</span>
        </p>
      </div>
      <span className="shrink-0 text-muted">{time}</span>
    </div>
  );
}

function NeedsRsvpCard({
  events,
  expanded,
  onToggle,
  onChanged,
}: {
  events: CrossPlaybookEventRow[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  return (
    <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-amber-700 dark:text-amber-300" />
          <span className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            {events.length} event{events.length === 1 ? "" : "s"} need your RSVP
          </span>
        </div>
        <ChevronDown
          className={
            "size-4 text-amber-700 transition-transform dark:text-amber-300 " +
            (expanded ? "rotate-180" : "")
          }
        />
      </button>
      {expanded && (
        <ul className="space-y-2 px-3 pb-3">
          {events.map((e) => (
            <EventRow
              key={`needs:${e.id}:${e.occurrenceDate}`}
              event={e}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventRow({
  event,
  onChanged,
}: {
  event: CrossPlaybookEventRow;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const meta = EVENT_TYPE_META[event.type];
  const Icon = meta.icon;
  const start = new Date(event.startsAt);
  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const headline =
    event.type === "game" && event.opponent
      ? `${event.homeAway === "away" ? "@" : "vs"} ${event.opponent}`
      : event.type === "scrimmage" && event.opponent
        ? `Scrimmage ${event.homeAway === "away" ? "@" : "vs"} ${event.opponent}`
        : event.title;
  const relative = relativeDayLabel(start);
  const color = event.playbookColor ?? FALLBACK_PLAYBOOK_COLOR;
  const needsRsvp = event.myRsvp == null;

  function quickRsvp(status: "yes" | "no" | "maybe") {
    const occurrenceDate =
      event.occurrenceDate || new Date(event.startsAt).toISOString().slice(0, 10);
    startTransition(async () => {
      const res = await setRsvpAction({
        eventId: event.id,
        occurrenceDate,
        status,
        note: null,
      });
      if (!res.ok) toast(res.error, "error");
      else onChanged();
    });
  }

  const href = `/playbooks/${event.playbookId}?tab=calendar`;

  return (
    <li
      className="rounded-xl border-l-4 bg-surface-raised px-3 py-2.5 shadow-sm ring-1 ring-border"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center gap-3">
        <Link
          href={href}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ${meta.chipActive}`}
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-nowrap">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {headline}
              </h3>
              <span
                className="inline-flex shrink-0 items-center gap-1 truncate text-xs font-medium"
                style={{ color }}
                title={event.playbookName}
              >
                <span
                  className="inline-block size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="max-w-[10rem] truncate">{event.playbookName}</span>
              </span>
              <span className="shrink-0 text-xs text-muted sm:ml-2">
                {relative ?? dateLabel} · {timeLabel}
              </span>
              {event.location.name && (
                <span className="hidden min-w-0 truncate text-xs text-muted sm:inline sm:ml-2">
                  <MapPin className="mr-1 inline size-3" />
                  {event.location.name}
                </span>
              )}
            </div>
            {event.location.name && (
              <p className="mt-0.5 truncate text-xs text-muted sm:hidden">
                <MapPin className="mr-1 inline size-3" />
                {event.location.name}
              </p>
            )}
          </div>
        </Link>

        {needsRsvp && (
          <div
            className="hidden items-center gap-1.5 sm:flex"
            onClick={(ev) => ev.stopPropagation()}
          >
            {(["yes", "maybe", "no"] as const).map((s) => {
              const labels = { yes: "Going", maybe: "Maybe", no: "Can’t go" };
              const colors = {
                yes: "bg-emerald-100 text-emerald-800 ring-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800",
                maybe:
                  "bg-amber-100 text-amber-800 ring-amber-300 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
                no: "bg-red-100 text-red-800 ring-red-300 hover:bg-red-200 dark:bg-red-950 dark:text-red-100 dark:ring-red-800",
              };
              return (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  onClick={() => quickRsvp(s)}
                  className={
                    "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition disabled:opacity-60 " +
                    colors[s]
                  }
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>
        )}
        {!needsRsvp && event.myRsvp && (
          <span
            className={
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " +
              (event.myRsvp.status === "yes"
                ? "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800"
                : event.myRsvp.status === "maybe"
                  ? "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800"
                  : "bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-100 dark:ring-red-800")
            }
          >
            {event.myRsvp.status === "yes"
              ? "Going"
              : event.myRsvp.status === "maybe"
                ? "Maybe"
                : "Can’t go"}
          </span>
        )}
      </div>

      {needsRsvp && (
        <div
          className="mt-2.5 grid grid-cols-3 gap-1.5 sm:hidden"
          onClick={(ev) => ev.stopPropagation()}
        >
          {(["yes", "maybe", "no"] as const).map((s) => {
            const labels = { yes: "Going", maybe: "Maybe", no: "Can’t go" };
            const colors = {
              yes: "bg-emerald-100 text-emerald-800 ring-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800",
              maybe:
                "bg-amber-100 text-amber-800 ring-amber-300 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
              no: "bg-red-100 text-red-800 ring-red-300 hover:bg-red-200 dark:bg-red-950 dark:text-red-100 dark:ring-red-800",
            };
            return (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => quickRsvp(s)}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition disabled:opacity-60 " +
                  colors[s]
                }
              >
                {labels[s]}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
