"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  Calendar,
  ChevronDown,
  CheckSquare,
  MapPin,
  Repeat,
  X,
} from "lucide-react";
import { Button, useToast } from "@/components/ui";
import {
  bulkRsvpAction,
  clearRsvpAction,
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
import { BulkRsvpBar } from "./BulkRsvpBar";
import {
  groupEventsForList,
  occurrenceKey,
  summarizeGroup,
  withOptimisticRsvp,
  type EventGroup,
} from "@/lib/calendar/grouping";

type ViewKind = "list" | "week" | "month";

const FALLBACK_PLAYBOOK_COLOR = "#64748B";

export function HomeCalendarTab() {
  const { toast } = useToast();
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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const [bulkBusy, startBulkTransition] = useTransition();

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

  // Apply an RSVP change to local state without waiting on the server — used
  // by per-row buttons so the button flips instantly. The server action
  // still runs in the background; on failure the row component calls
  // `load()` to revert from the source of truth.
  function applyOptimisticRsvp(
    eventId: string,
    occurrenceDate: string,
    newStatus: "yes" | "maybe" | "no" | null,
  ) {
    setEvents((prev) =>
      withOptimisticRsvp(prev, eventId, occurrenceDate, newStatus),
    );
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

  const visible = useMemo(() => {
    if (view === "month" && selectedDayKey) {
      return events.filter(
        (e) => ymd(new Date(e.startsAt)) === selectedDayKey,
      );
    }
    return events;
  }, [view, selectedDayKey, events]);

  const groups = useMemo(() => groupEventsForList(visible), [visible]);

  // Selection target = every visible occurrence that can still be RSVP'd
  // (i.e. is in the future). "Select all" applies across both rollups and
  // singletons; users can also long-press an individual date inside a
  // series to select just that one.
  const selectableKeys = useMemo(() => {
    const now = Date.now();
    const out = new Set<string>();
    for (const e of visible) {
      if (new Date(e.startsAt).getTime() > now) {
        out.add(occurrenceKey(e));
      }
    }
    return out;
  }, [visible]);

  function toggleSelect(keys: string[]) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      // If any key in the group is unselected, select all; else clear all.
      const allOn = keys.every((k) => next.has(k));
      if (allOn) {
        keys.forEach((k) => next.delete(k));
      } else {
        keys.forEach((k) => next.add(k));
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedKeys(new Set(selectableKeys));
  }
  function clearSelection() {
    setSelectedKeys(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedKeys(new Set());
  }

  function runBulk(
    pairs: { eventId: string; occurrenceDate: string }[],
    status: "yes" | "maybe" | "no",
    successLabel: string,
  ) {
    if (pairs.length === 0) return;
    startBulkTransition(async () => {
      const res = await bulkRsvpAction(pairs, status);
      if (!res.ok) {
        toast(
          `${res.error} (${res.applied}/${pairs.length} applied)`,
          "error",
        );
      } else {
        toast(
          `${successLabel} to ${res.applied} event${res.applied === 1 ? "" : "s"}`,
          "success",
        );
      }
      load();
    });
  }

  function bulkRsvpSelected(status: "yes" | "maybe" | "no") {
    const pairs: { eventId: string; occurrenceDate: string }[] = [];
    for (const e of visible) {
      if (selectedKeys.has(occurrenceKey(e))) {
        pairs.push({ eventId: e.id, occurrenceDate: e.occurrenceDate });
      }
    }
    runBulk(
      pairs,
      status,
      `RSVP'd ${status === "yes" ? "Going" : status === "maybe" ? "Maybe" : "Can't go"}`,
    );
    exitSelectMode();
  }

  function bulkRsvpSeries(
    group: Extract<EventGroup<CrossPlaybookEventRow>, { kind: "series" }>,
    status: "yes" | "maybe" | "no",
  ) {
    const { unrespondedOccurrences } = summarizeGroup(group);
    const pairs = unrespondedOccurrences.map((o) => ({
      eventId: o.id,
      occurrenceDate: o.occurrenceDate,
    }));
    runBulk(
      pairs,
      status,
      `RSVP'd ${status === "yes" ? "Going" : status === "maybe" ? "Maybe" : "Can't go"}`,
    );
  }

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
  const showList = view === "list" || (view === "month" && selectedDayKey);

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
                  if (v !== "list" && v !== "month") exitSelectMode();
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
        <div className="flex flex-wrap items-center gap-2">
          {showList && selectableKeys.size > 0 && (
            <button
              type="button"
              onClick={() => {
                if (selectMode) exitSelectMode();
                else setSelectMode(true);
              }}
              className={
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition-colors " +
                (selectMode
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-surface text-foreground ring-border hover:bg-surface-hover")
              }
              aria-pressed={selectMode}
            >
              <CheckSquare className="size-3.5" />
              {selectMode ? "Done" : "Select"}
            </button>
          )}
          <Button variant="primary" size="sm" onClick={openPicker}>
            <CalendarPlus className="mr-1.5 size-4" />
            New event
          </Button>
        </div>
      </div>

      {empty && (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <Calendar className="mx-auto mb-2 size-8 text-muted" />
          <p className="text-sm font-medium text-foreground">No upcoming events</p>
          <p className="mt-1 text-xs text-muted">
            Schedule a practice, game, or scrimmage with &ldquo;New event.&rdquo;
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

      {!empty && showList && (
        <>
          <ul className="space-y-2 pb-2">
            {groups.map((group) => {
              if (group.kind === "single") {
                return (
                  <EventRow
                    key={occurrenceKey(group.event)}
                    event={group.event}
                    selectMode={selectMode}
                    selected={selectedKeys.has(occurrenceKey(group.event))}
                    onToggleSelect={() =>
                      toggleSelect([occurrenceKey(group.event)])
                    }
                    onOptimisticRsvp={applyOptimisticRsvp}
                    onServerError={load}
                  />
                );
              }
              const groupKeys = group.occurrences
                .filter((o) => new Date(o.startsAt).getTime() > Date.now())
                .map(occurrenceKey);
              return (
                <SeriesGroupCard
                  key={`series:${group.parentId}`}
                  group={group}
                  expanded={expandedSeries.has(group.parentId)}
                  onToggleExpand={() =>
                    setExpandedSeries((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.parentId)) next.delete(group.parentId);
                      else next.add(group.parentId);
                      return next;
                    })
                  }
                  selectMode={selectMode}
                  selectedKeys={selectedKeys}
                  onToggleSelectGroup={() => toggleSelect(groupKeys)}
                  onToggleSelectOne={(k) => toggleSelect([k])}
                  busy={bulkBusy}
                  onSeriesRsvp={(status) => bulkRsvpSeries(group, status)}
                  onOptimisticRsvp={applyOptimisticRsvp}
                  onServerError={load}
                />
              );
            })}
            {view === "month" && selectedDayKey && groups.length === 0 && (
              <li className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-xs text-muted">
                No events on this day.
              </li>
            )}
          </ul>
          {selectMode && (
            <BulkRsvpBar
              selectedCount={selectedKeys.size}
              selectableCount={selectableKeys.size}
              busy={bulkBusy}
              onSelectAll={selectAll}
              onClear={clearSelection}
              onRsvp={bulkRsvpSelected}
              onExit={exitSelectMode}
            />
          )}
        </>
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-surface-raised shadow-xl ring-1 ring-border sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-4">
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
        <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
            className="inline-block size-1.5 shrink-0 rounded-full ring-1 ring-border"
            style={{ backgroundColor: color }}
          />
          <span className="truncate">{event.playbookName}</span>
        </p>
      </div>
      <span className="shrink-0 text-muted">{time}</span>
    </div>
  );
}

function RsvpButtons({
  busy,
  onPick,
  size = "sm",
  activeStatus,
  visibility = "responsive",
}: {
  busy: boolean;
  /** Called with the picked status, or null to clear (when the user taps
   *  the already-active button). */
  onPick: (status: "yes" | "maybe" | "no" | null) => void;
  size?: "sm" | "grid";
  /** When provided, the matching button is rendered in its filled "active"
   *  style and the others are muted. Tapping the active button signals a
   *  clear (onPick(null)). When undefined, all three buttons share the
   *  same colored "needs response" style. */
  activeStatus?: "yes" | "maybe" | "no" | null;
  /** "responsive" hides on mobile (paired with a separate grid block);
   *  "always" shows the same row at every breakpoint, e.g. inside an
   *  expanded series date list. */
  visibility?: "responsive" | "always";
}) {
  const wrap =
    size === "grid"
      ? "grid grid-cols-3 gap-1.5"
      : visibility === "always"
        ? "flex items-center gap-1.5"
        : "hidden items-center gap-1.5 sm:flex";
  const hasActive = activeStatus != null;
  return (
    <div className={wrap} onClick={(ev) => ev.stopPropagation()}>
      {(["yes", "maybe", "no"] as const).map((s) => {
        const labels = { yes: "Going", maybe: "Maybe", no: "Can’t go" };
        const isActive = s === activeStatus;
        const activeColors = {
          yes: "bg-emerald-100 text-emerald-900 ring-emerald-400 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-700",
          maybe:
            "bg-amber-100 text-amber-900 ring-amber-400 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700",
          no: "bg-red-100 text-red-900 ring-red-400 hover:bg-red-200 dark:bg-red-950 dark:text-red-100 dark:ring-red-700",
        };
        const idleNeedsResponse = {
          yes: "bg-emerald-100 text-emerald-800 ring-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800",
          maybe:
            "bg-amber-100 text-amber-800 ring-amber-300 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
          no: "bg-red-100 text-red-800 ring-red-300 hover:bg-red-200 dark:bg-red-950 dark:text-red-100 dark:ring-red-800",
        };
        const mutedRespondedAlready =
          "bg-surface text-muted ring-border hover:bg-surface-inset hover:text-foreground";
        const color = hasActive
          ? isActive
            ? activeColors[s]
            : mutedRespondedAlready
          : idleNeedsResponse[s];
        const title = isActive
          ? `Clear ${labels[s]} for this date`
          : `Mark ${labels[s]}`;
        return (
          <button
            key={s}
            type="button"
            disabled={busy}
            title={title}
            onClick={() => onPick(isActive ? null : s)}
            className={
              (size === "grid"
                ? "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition disabled:opacity-60 "
                : "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition disabled:opacity-60 ") +
              color
            }
          >
            {labels[s]}
          </button>
        );
      })}
    </div>
  );
}

function RsvpStatusPill({
  status,
}: {
  status: "yes" | "maybe" | "no";
}) {
  const label =
    status === "yes" ? "Going" : status === "maybe" ? "Maybe" : "Can’t go";
  const cls =
    status === "yes"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800"
      : status === "maybe"
        ? "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800"
        : "bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-100 dark:ring-red-800";
  return (
    <span
      className={
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " +
        cls
      }
    >
      {label}
    </span>
  );
}

function SelectCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={(ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        onChange();
      }}
      className={
        "flex size-5 shrink-0 items-center justify-center rounded border transition " +
        (checked || indeterminate
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface hover:bg-surface-hover")
      }
    >
      {indeterminate ? (
        <span className="block h-0.5 w-2.5 rounded-full bg-current" />
      ) : checked ? (
        <svg viewBox="0 0 16 16" className="size-3.5 fill-none stroke-current">
          <path d="M3 8.5 6.5 12 13 4.5" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}

function EventRow({
  event,
  selectMode,
  selected,
  onToggleSelect,
  onOptimisticRsvp,
  onServerError,
}: {
  event: CrossPlaybookEventRow;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOptimisticRsvp: (
    eventId: string,
    occurrenceDate: string,
    status: "yes" | "maybe" | "no" | null,
  ) => void;
  onServerError: () => void;
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
  const isPast = new Date(event.startsAt).getTime() <= Date.now();
  const selectable = !isPast;
  const needsRsvp = event.myRsvp == null && !isPast;

  function quickRsvp(status: "yes" | "maybe" | "no") {
    const occurrenceDate =
      event.occurrenceDate || new Date(event.startsAt).toISOString().slice(0, 10);
    onOptimisticRsvp(event.id, occurrenceDate, status);
    startTransition(async () => {
      const res = await setRsvpAction({
        eventId: event.id,
        occurrenceDate,
        status,
        note: null,
      });
      if (!res.ok) {
        toast(res.error, "error");
        onServerError();
      }
    });
  }

  const href = `/playbooks/${event.playbookId}?tab=calendar`;
  const bodyClick = (ev: React.MouseEvent) => {
    if (selectMode && selectable) {
      ev.preventDefault();
      onToggleSelect();
    }
  };

  const inner = (
    <>
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
            className="inline-flex shrink-0 items-center gap-1 truncate text-xs font-medium text-muted"
            title={event.playbookName}
          >
            <span
              className="inline-block size-2 shrink-0 rounded-full ring-1 ring-border"
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
    </>
  );

  return (
    <li
      className={
        "rounded-xl border-l-4 bg-surface-raised px-3 py-2.5 shadow-sm ring-1 transition " +
        (selectMode && selected ? "ring-primary/60" : "ring-border")
      }
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center gap-3">
        {selectMode && (
          <SelectCheckbox
            checked={selected}
            onChange={onToggleSelect}
            label={selectable ? `Select ${headline}` : "Can't select past event"}
          />
        )}
        {selectMode && selectable ? (
          <button
            type="button"
            onClick={onToggleSelect}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            {inner}
          </button>
        ) : (
          <Link
            href={href}
            onClick={bodyClick}
            className={
              "flex min-w-0 flex-1 items-center gap-3 " +
              (selectMode && !selectable ? "pointer-events-none opacity-60" : "")
            }
          >
            {inner}
          </Link>
        )}

        {!selectMode && needsRsvp && (
          <RsvpButtons
            busy={pending}
            onPick={(s) => s && quickRsvp(s)}
          />
        )}
        {!selectMode && !needsRsvp && event.myRsvp && (
          <RsvpStatusPill status={event.myRsvp.status} />
        )}
      </div>

      {!selectMode && needsRsvp && (
        <div className="mt-2.5 sm:hidden">
          <RsvpButtons
            busy={pending}
            onPick={(s) => s && quickRsvp(s)}
            size="grid"
          />
        </div>
      )}
    </li>
  );
}

function rruleSummary(rule: string | null): string {
  if (!rule) return "";
  // Best-effort short label for the most common cases — full iCal parsing
  // isn't needed for a header subtitle. Falls through to a generic
  // "Recurring" when we can't pattern-match.
  const freqMatch = rule.match(/FREQ=([A-Z]+)/);
  const byday = rule.match(/BYDAY=([A-Z,]+)/);
  const freq = freqMatch?.[1];
  if (freq === "WEEKLY" && byday) {
    const days = byday[1]!
      .split(",")
      .map(
        (d) =>
          ({
            MO: "Mon",
            TU: "Tue",
            WE: "Wed",
            TH: "Thu",
            FR: "Fri",
            SA: "Sat",
            SU: "Sun",
          })[d] ?? d,
      )
      .join("/");
    return `${days}s`;
  }
  if (freq === "WEEKLY") return "Weekly";
  if (freq === "DAILY") return "Daily";
  if (freq === "MONTHLY") return "Monthly";
  return "Recurring";
}

function SeriesGroupCard({
  group,
  expanded,
  onToggleExpand,
  selectMode,
  selectedKeys,
  onToggleSelectGroup,
  onToggleSelectOne,
  busy,
  onSeriesRsvp,
  onOptimisticRsvp,
  onServerError,
}: {
  group: Extract<EventGroup<CrossPlaybookEventRow>, { kind: "series" }>;
  expanded: boolean;
  onToggleExpand: () => void;
  selectMode: boolean;
  selectedKeys: Set<string>;
  onToggleSelectGroup: () => void;
  onToggleSelectOne: (key: string) => void;
  busy: boolean;
  onSeriesRsvp: (status: "yes" | "maybe" | "no") => void;
  onOptimisticRsvp: (
    eventId: string,
    occurrenceDate: string,
    status: "yes" | "maybe" | "no" | null,
  ) => void;
  onServerError: () => void;
}) {
  const head = group.occurrences[0]!;
  const meta = EVENT_TYPE_META[head.type];
  const Icon = meta.icon;
  const color = head.playbookColor ?? FALLBACK_PLAYBOOK_COLOR;
  const summary = summarizeGroup(group);
  const recurLabel = rruleSummary(head.recurrenceRule);
  const headTime = new Date(head.startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const nextOcc = group.occurrences.find(
    (o) => new Date(o.startsAt).getTime() > Date.now(),
  );
  const nextLabel = nextOcc
    ? (relativeDayLabel(new Date(nextOcc.startsAt)) ??
      new Date(nextOcc.startsAt).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }))
    : null;

  const headline =
    head.type === "game" && head.opponent
      ? `${head.homeAway === "away" ? "@" : "vs"} ${head.opponent}`
      : head.type === "scrimmage" && head.opponent
        ? `Scrimmage ${head.homeAway === "away" ? "@" : "vs"} ${head.opponent}`
        : head.title;

  const upcomingKeys = group.occurrences
    .filter((o) => new Date(o.startsAt).getTime() > Date.now())
    .map(occurrenceKey);
  const selectedCount = upcomingKeys.filter((k) => selectedKeys.has(k)).length;
  const allSelected =
    upcomingKeys.length > 0 && selectedCount === upcomingKeys.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <li
      className={
        "rounded-xl border-l-4 bg-surface-raised shadow-sm ring-1 transition " +
        (selectMode && (allSelected || someSelected)
          ? "ring-primary/60"
          : "ring-border")
      }
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {selectMode && upcomingKeys.length > 0 && (
          <SelectCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={onToggleSelectGroup}
            label={`Select ${upcomingKeys.length} occurrences of ${headline}`}
          />
        )}
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ${meta.chipActive}`}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-nowrap">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {headline}
            </h3>
            <span
              className="inline-flex shrink-0 items-center gap-1 truncate text-xs font-medium text-muted"
              title={head.playbookName}
            >
              <span
                className="inline-block size-2 shrink-0 rounded-full ring-1 ring-border"
                style={{ backgroundColor: color }}
              />
              <span className="max-w-[10rem] truncate">{head.playbookName}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted sm:ml-2">
              <Repeat className="size-3" />
              {recurLabel || "Recurring"} · {headTime}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {summary.upcoming} upcoming
            {summary.unrespondedOccurrences.length > 0
              ? ` · ${summary.unrespondedOccurrences.length} need response`
              : " · all responded"}
            {nextLabel ? ` · next ${nextLabel}` : ""}
          </p>
        </button>

        {!selectMode && summary.unrespondedOccurrences.length > 0 && (
          <RsvpButtons
            busy={busy}
            onPick={(s) => s && onSeriesRsvp(s)}
          />
        )}
        {!selectMode && summary.unrespondedOccurrences.length === 0 && (
          <span className="hidden shrink-0 rounded-full bg-surface-inset px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-border sm:inline-block">
            All responded — expand to change any date
          </span>
        )}

        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? "Collapse series" : "Expand series"}
          className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
        >
          <ChevronDown
            className={
              "size-4 transition-transform " + (expanded ? "rotate-180" : "")
            }
          />
        </button>
      </div>

      {!selectMode && summary.unrespondedOccurrences.length > 0 && (
        <div className="px-3 pb-2.5 sm:hidden">
          <RsvpButtons
            busy={busy}
            onPick={(s) => s && onSeriesRsvp(s)}
            size="grid"
          />
        </div>
      )}

      {expanded && (
        <ul className="space-y-1.5 border-t border-border px-3 py-2.5">
          {group.occurrences.map((o) => (
            <SeriesOccurrenceRow
              key={occurrenceKey(o)}
              event={o}
              selectMode={selectMode}
              selected={selectedKeys.has(occurrenceKey(o))}
              onToggleSelect={() => onToggleSelectOne(occurrenceKey(o))}
              onOptimisticRsvp={onOptimisticRsvp}
              onServerError={onServerError}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SeriesOccurrenceRow({
  event,
  selectMode,
  selected,
  onToggleSelect,
  onOptimisticRsvp,
  onServerError,
}: {
  event: CrossPlaybookEventRow;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOptimisticRsvp: (
    eventId: string,
    occurrenceDate: string,
    status: "yes" | "maybe" | "no" | null,
  ) => void;
  onServerError: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const start = new Date(event.startsAt);
  const isPast = start.getTime() <= Date.now();
  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const relative = relativeDayLabel(start);

  function changeRsvp(status: "yes" | "maybe" | "no" | null) {
    if (isPast) return;
    onOptimisticRsvp(event.id, event.occurrenceDate, status);
    startTransition(async () => {
      const res =
        status == null
          ? await clearRsvpAction(event.id, event.occurrenceDate)
          : await setRsvpAction({
              eventId: event.id,
              occurrenceDate: event.occurrenceDate,
              status,
              note: null,
            });
      if (!res.ok) {
        toast(res.error, "error");
        onServerError();
      }
    });
  }

  return (
    <li
      className={
        "flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-xs " +
        (isPast ? "opacity-50" : "")
      }
    >
      {selectMode && !isPast && (
        <SelectCheckbox
          checked={selected}
          onChange={onToggleSelect}
          label={`Select ${dateLabel}`}
        />
      )}
      <span className="min-w-0 flex-1 truncate text-foreground">
        {relative ?? dateLabel}
      </span>
      {!selectMode && !isPast && (
        <RsvpButtons
          busy={pending}
          onPick={changeRsvp}
          activeStatus={event.myRsvp?.status ?? null}
          visibility="always"
        />
      )}
      {!selectMode && isPast && event.myRsvp && (
        <RsvpStatusPill status={event.myRsvp.status} />
      )}
      {isPast && <span className="text-muted">past</span>}
    </li>
  );
}
