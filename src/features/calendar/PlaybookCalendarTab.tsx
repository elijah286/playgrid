"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarPlus,
  CheckSquare,
  ChevronDown,
  Clock,
  ExternalLink,
  MapPin,
  Pencil,
  Repeat,
  Rss,
  Users,
} from "lucide-react";
import { Button, useToast } from "@/components/ui";
import {
  bulkRsvpAction,
  clearRsvpAction,
  listEventAttendeesAction,
  listEventsForPlaybookAction,
  markCalendarSeenAction,
  setRsvpAction,
  type CalendarAttendeeRow,
  type CalendarEventRow,
} from "@/app/actions/calendar";
import { SubscribeFeedModal } from "./SubscribeFeedModal";
import { CoachCalCTA } from "@/features/coach-ai/CoachCalCTA";
import { EventSheet, type EventSheetInitial } from "./EventSheet";
import { EVENT_TYPE_META } from "./eventIcons";
import { MonthGrid, ymd } from "./MonthGrid";
import { WeekAgenda, CompactEventChip } from "./WeekAgenda";
import { BulkRsvpBar } from "./BulkRsvpBar";
import {
  groupEventsForList,
  occurrenceKey,
  summarizeGroup,
  withOptimisticRsvp,
  type EventGroup,
} from "@/lib/calendar/grouping";
import type { SelectedPlace } from "./PlaceAutocomplete";

type Mode = "upcoming" | "past";
type ViewKind = "list" | "week" | "month";

export function PlaybookCalendarTab({
  playbookId,
  viewerIsCoach,
  onCountsChange,
}: {
  playbookId: string;
  viewerIsCoach: boolean;
  onCountsChange?: (counts: { upcomingTotal: number }) => void;
}) {
  const { toast } = useToast();
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("upcoming");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventSheetInitial | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [view, setView] = useState<ViewKind>("list");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());
  const [bulkBusy, startBulkTransition] = useTransition();

  function load() {
    setLoading(true);
    listEventsForPlaybookAction(playbookId)
      .then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setError(null);
        setEvents(res.events);
      })
      .finally(() => setLoading(false));
  }

  // Optimistic per-row RSVP swap — see HomeCalendarTab for the rationale.
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
    markCalendarSeenAction(playbookId).catch(() => {
      /* ignore — best effort */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId]);

  useEffect(() => {
    function onMutated() {
      load();
    }
    window.addEventListener("coach-ai-mutated", onMutated);
    return () => window.removeEventListener("coach-ai-mutated", onMutated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId]);

  const now = Date.now();
  const partitioned = useMemo(() => {
    const upcoming: CalendarEventRow[] = [];
    const past: CalendarEventRow[] = [];
    for (const e of events) {
      const end = new Date(e.startsAt).getTime() + e.durationMinutes * 60_000;
      if (end >= now) {
        upcoming.push(e);
      } else {
        past.push(e);
      }
    }
    past.reverse();
    return { upcoming, past };
  }, [events, now]);

  useEffect(() => {
    onCountsChange?.({ upcomingTotal: partitioned.upcoming.length });
  }, [partitioned.upcoming.length, onCountsChange]);

  const baseList =
    mode === "upcoming" ? partitioned.upcoming : partitioned.past;
  const visibleEvents = useMemo(() => {
    if (view === "month" && selectedDayKey) {
      return events.filter(
        (e) => ymd(new Date(e.startsAt)) === selectedDayKey,
      );
    }
    return baseList;
  }, [view, selectedDayKey, events, baseList]);

  const groups = useMemo(
    () => groupEventsForList(visibleEvents),
    [visibleEvents],
  );

  const selectableKeys = useMemo(() => {
    if (mode === "past") return new Set<string>();
    const out = new Set<string>();
    const t = Date.now();
    for (const e of visibleEvents) {
      if (new Date(e.startsAt).getTime() > t) out.add(occurrenceKey(e));
    }
    return out;
  }, [visibleEvents, mode]);

  function toggleSelect(keys: string[]) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      if (allOn) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
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
  ) {
    if (pairs.length === 0) return;
    const labelMap = { yes: "Going", maybe: "Maybe", no: "Can't go" } as const;
    startBulkTransition(async () => {
      const res = await bulkRsvpAction(pairs, status);
      if (!res.ok) {
        toast(
          `${res.error} (${res.applied}/${pairs.length} applied)`,
          "error",
        );
      } else {
        toast(
          `RSVP'd ${labelMap[status]} to ${res.applied} event${res.applied === 1 ? "" : "s"}`,
          "success",
        );
      }
      load();
    });
  }

  function bulkRsvpSelected(status: "yes" | "maybe" | "no") {
    const pairs: { eventId: string; occurrenceDate: string }[] = [];
    for (const e of visibleEvents) {
      if (selectedKeys.has(occurrenceKey(e))) {
        pairs.push({ eventId: e.id, occurrenceDate: e.occurrenceDate });
      }
    }
    runBulk(pairs, status);
    exitSelectMode();
  }

  function bulkRsvpSeries(
    group: Extract<EventGroup, { kind: "series" }>,
    status: "yes" | "maybe" | "no",
  ) {
    const pairs = summarizeGroup(group).unrespondedOccurrences.map((o) => ({
      eventId: o.id,
      occurrenceDate: o.occurrenceDate,
    }));
    runBulk(pairs, status);
  }

  function openCreate() {
    setEditTarget(null);
    setSheetOpen(true);
  }

  function openEdit(e: CalendarEventRow) {
    if (!viewerIsCoach) return;
    const place: SelectedPlace | null = e.location.name
      ? {
          placeId: null,
          name: e.location.name,
          address: e.location.address ?? "",
          lat: e.location.lat,
          lng: e.location.lng,
        }
      : null;
    setEditTarget({
      id: e.id,
      type: e.type,
      title: e.title,
      startsAtIso: e.startsAt,
      durationMinutes: e.durationMinutes,
      arriveMinutesBefore: e.arriveMinutesBefore,
      timezone: e.timezone,
      location: place,
      notes: e.notes,
      opponent: e.opponent,
      homeAway: e.homeAway,
      recurrenceRule: e.recurrenceRule,
      reminderOffsetsMinutes: e.reminderOffsetsMinutes,
      occurrenceDate: e.occurrenceDate,
    });
    setSheetOpen(true);
  }

  const showListUi = view === "list" || (view === "month" && selectedDayKey);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
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
          {view === "list" && (
            <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-border">
              {([
                { key: "upcoming" as const, label: "Upcoming" },
                { key: "past" as const, label: "Past" },
              ]).map((m) => {
                const active = mode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      setMode(m.key);
                      if (m.key === "past") exitSelectMode();
                    }}
                    className={
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface text-foreground hover:bg-surface-hover")
                    }
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewerIsCoach && (
            <CoachCalCTA entryPoint="playbook_schedule_season" />
          )}
          {showListUi && mode !== "past" && selectableKeys.size > 0 && (
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
          <button
            type="button"
            onClick={() => setSubscribeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted ring-1 ring-border hover:bg-surface-hover hover:text-foreground"
            title="Subscribe to this calendar"
          >
            <Rss className="size-3.5" />
            Subscribe
          </button>
          {viewerIsCoach ? (
            <Button variant="primary" size="sm" onClick={openCreate}>
              <CalendarPlus className="mr-1.5 size-4" />
              New event
            </Button>
          ) : (
            <button
              type="button"
              onClick={() =>
                toast(
                  "Only the team's coaches can create and update the schedule.",
                  "info",
                )
              }
              title="Only the team's coaches can create and update the schedule"
              className="inline-flex h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-surface-inset px-3 text-sm font-medium text-muted ring-1 ring-border"
              aria-disabled="true"
            >
              <CalendarPlus className="size-4" />
              <span>New event</span>
            </button>
          )}
        </div>
      </div>

      {loading && (
        <p className="py-8 text-center text-sm text-muted">Loading events…</p>
      )}
      {error && !loading && (
        <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {view === "month" && !loading && !error && (
        <MonthGrid
          events={events}
          selectedDayKey={selectedDayKey}
          onSelectDay={(d) => setSelectedDayKey(d ? ymd(d) : null)}
          onSelectEvent={viewerIsCoach ? (e) => openEdit(e) : undefined}
        />
      )}
      {view === "week" && !loading && !error && (
        <WeekAgenda
          events={events}
          renderEvent={(e) => (
            <button
              type="button"
              onClick={() => openEdit(e)}
              className="w-full text-left"
            >
              <CompactEventChip event={e} />
            </button>
          )}
        />
      )}

      {!loading && !error && groups.length === 0 && view === "list" && (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-foreground">
            {mode === "past" ? "No past events" : "No upcoming events"}
          </p>
          {viewerIsCoach && mode !== "past" && (
            <p className="mt-1 text-xs text-muted">
              Tap “New event” to schedule a practice, game, or scrimmage.
            </p>
          )}
        </div>
      )}

      {!loading && !error && showListUi && groups.length > 0 && (
        <>
          <ul className="space-y-2 pb-2">
            {groups.map((group) => {
              if (group.kind === "single") {
                return (
                  <EventCard
                    key={occurrenceKey(group.event)}
                    event={group.event}
                    viewerIsCoach={viewerIsCoach}
                    isPast={mode === "past"}
                    selectMode={selectMode}
                    selected={selectedKeys.has(occurrenceKey(group.event))}
                    onToggleSelect={() =>
                      toggleSelect([occurrenceKey(group.event)])
                    }
                    onEdit={() => openEdit(group.event)}
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
                  viewerIsCoach={viewerIsCoach}
                  isPast={mode === "past"}
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
                  onEdit={(occ) => openEdit(occ)}
                  onOptimisticRsvp={applyOptimisticRsvp}
                  onServerError={load}
                />
              );
            })}
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

      {sheetOpen && (
        <EventSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          playbookId={playbookId}
          initial={editTarget}
          onSaved={load}
        />
      )}

      {subscribeOpen && (
        <SubscribeFeedModal
          playbookId={playbookId}
          viewerIsCoach={viewerIsCoach}
          onClose={() => setSubscribeOpen(false)}
        />
      )}
    </div>
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

function RsvpButtons({
  pending,
  onPick,
  size = "sm",
  activeStatus,
  visibility = "responsive",
}: {
  pending: boolean;
  /** Called with the picked status, or null when the user taps the
   *  already-active button (treat as "clear my RSVP for this date"). */
  onPick: (status: "yes" | "maybe" | "no" | null) => void;
  size?: "sm" | "grid";
  /** When set, the matching button renders in its filled "active" style
   *  and the others are muted; tapping the active one signals a clear. */
  activeStatus?: "yes" | "maybe" | "no" | null;
  /** "responsive" hides on mobile (paired with a separate grid block);
   *  "always" shows the same row at every breakpoint. */
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
        const needsResponse = {
          yes: "bg-emerald-100 text-emerald-800 ring-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800",
          maybe:
            "bg-amber-100 text-amber-800 ring-amber-300 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
          no: "bg-red-100 text-red-800 ring-red-300 hover:bg-red-200 dark:bg-red-950 dark:text-red-100 dark:ring-red-800",
        };
        const muted =
          "bg-surface text-muted ring-border hover:bg-surface-inset hover:text-foreground";
        const color = hasActive
          ? isActive
            ? activeColors[s]
            : muted
          : needsResponse[s];
        return (
          <button
            key={s}
            type="button"
            disabled={pending}
            title={isActive ? `Clear ${labels[s]}` : `Mark ${labels[s]}`}
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

function RsvpStatusPill({ status }: { status: "yes" | "maybe" | "no" }) {
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

function rruleSummary(rule: string | null): string {
  if (!rule) return "";
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

function EventCard({
  event,
  viewerIsCoach,
  isPast,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
  onOptimisticRsvp,
  onServerError,
}: {
  event: CalendarEventRow;
  viewerIsCoach: boolean;
  isPast: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
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
  const [expanded, setExpanded] = useState(false);
  const startDate = new Date(event.startsAt);
  const startMs = startDate.getTime();
  const selectable = !isPast && startMs > Date.now();

  function quickRsvp(status: "yes" | "no" | "maybe") {
    if (isPast) return;
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
  const formattedDate = startDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const formattedTime = startDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const totalRespondents =
    event.rsvpCounts.yes + event.rsvpCounts.no + event.rsvpCounts.maybe;

  const showInlineRsvp = !isPast && !event.myRsvp && !selectMode;

  return (
    <li
      className={
        "rounded-xl border bg-surface-raised px-3 py-2.5 shadow-sm transition " +
        (isPast ? "opacity-60 border-border " : "") +
        (selectMode && selected ? "border-primary/60 " : "border-border")
      }
    >
      <div className="flex items-center gap-3">
        {selectMode && selectable && (
          <SelectCheckbox
            checked={selected}
            onChange={onToggleSelect}
            label={`Select ${event.title}`}
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
          onClick={() => {
            if (selectMode && selectable) {
              onToggleSelect();
              return;
            }
            setExpanded((v) => !v);
          }}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-nowrap">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {event.title}
            </h3>
            <span className="shrink-0 text-xs text-muted">{meta.label}</span>
            <span className="shrink-0 text-xs text-muted sm:ml-2">
              {formattedDate} · {formattedTime}
              {event.durationMinutes ? ` · ${event.durationMinutes}m` : ""}
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
        </button>
        {showInlineRsvp && (
          <RsvpButtons
            pending={pending}
            onPick={(s) => s && quickRsvp(s)}
          />
        )}
        {!selectMode && (
          <div className="flex items-center gap-1">
            {viewerIsCoach && (
              <button
                type="button"
                onClick={onEdit}
                aria-label="Edit event"
                className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
              >
                <Pencil className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Collapse" : "Expand"}
              className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
            >
              <ChevronDown
                className={
                  "size-4 transition-transform " + (expanded ? "rotate-180" : "")
                }
              />
            </button>
          </div>
        )}
      </div>

      {showInlineRsvp && (
        <div className="mt-3 sm:hidden">
          <RsvpButtons
            pending={pending}
            onPick={(s) => s && quickRsvp(s)}
            size="grid"
          />
        </div>
      )}

      {expanded && !selectMode && (
        <EventCardDetail
          event={event}
          isPast={isPast}
          onOptimisticRsvp={onOptimisticRsvp}
          onServerError={onServerError}
          totalRespondents={totalRespondents}
        />
      )}
    </li>
  );
}

function SeriesGroupCard({
  group,
  viewerIsCoach,
  isPast,
  expanded,
  onToggleExpand,
  selectMode,
  selectedKeys,
  onToggleSelectGroup,
  onToggleSelectOne,
  busy,
  onSeriesRsvp,
  onEdit,
  onOptimisticRsvp,
  onServerError,
}: {
  group: Extract<EventGroup<CalendarEventRow>, { kind: "series" }>;
  viewerIsCoach: boolean;
  isPast: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  selectMode: boolean;
  selectedKeys: Set<string>;
  onToggleSelectGroup: () => void;
  onToggleSelectOne: (k: string) => void;
  busy: boolean;
  onSeriesRsvp: (status: "yes" | "maybe" | "no") => void;
  onEdit: (occ: CalendarEventRow) => void;
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
    ? new Date(nextOcc.startsAt).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

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
        "rounded-xl border bg-surface-raised shadow-sm transition " +
        (isPast ? "opacity-60 border-border " : "") +
        (selectMode && (allSelected || someSelected)
          ? "border-primary/60"
          : "border-border")
      }
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {selectMode && upcomingKeys.length > 0 && (
          <SelectCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={onToggleSelectGroup}
            label={`Select ${upcomingKeys.length} occurrences of ${head.title}`}
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
              {head.title}
            </h3>
            <span className="shrink-0 text-xs text-muted">{meta.label}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted sm:ml-2">
              <Repeat className="size-3" />
              {recurLabel || "Recurring"} · {headTime}
            </span>
            {head.location.name && (
              <span className="hidden min-w-0 truncate text-xs text-muted sm:inline sm:ml-2">
                <MapPin className="mr-1 inline size-3" />
                {head.location.name}
              </span>
            )}
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
            pending={busy}
            onPick={(s) => s && onSeriesRsvp(s)}
          />
        )}
        {!selectMode && summary.unrespondedOccurrences.length === 0 && (
          <span className="hidden shrink-0 rounded-full bg-surface-inset px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-border sm:inline-block">
            All responded — expand to change any date
          </span>
        )}

        {!selectMode && (
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
        )}
      </div>

      {!selectMode && summary.unrespondedOccurrences.length > 0 && (
        <div className="px-3 pb-2.5 sm:hidden">
          <RsvpButtons
            pending={busy}
            onPick={(s) => s && onSeriesRsvp(s)}
            size="grid"
          />
        </div>
      )}

      {expanded && !selectMode && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
          {(head.notes || head.location.name) && (
            <SeriesSharedDetails event={head} />
          )}
          <ul className="space-y-1.5">
            {group.occurrences.map((o) => (
              <SeriesOccurrenceRow
                key={occurrenceKey(o)}
                event={o}
                viewerIsCoach={viewerIsCoach}
                onOptimisticRsvp={onOptimisticRsvp}
                onServerError={onServerError}
                onEdit={() => onEdit(o)}
              />
            ))}
          </ul>
        </div>
      )}

      {expanded && selectMode && (
        <ul className="space-y-1.5 border-t border-border px-3 py-3 text-sm">
          {group.occurrences.map((o) => {
            const k = occurrenceKey(o);
            const isPastOcc = new Date(o.startsAt).getTime() <= Date.now();
            const dateLabel = new Date(o.startsAt).toLocaleDateString(
              undefined,
              { weekday: "short", month: "short", day: "numeric" },
            );
            return (
              <li
                key={k}
                className={
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs " +
                  (isPastOcc ? "opacity-50" : "")
                }
              >
                {!isPastOcc && (
                  <SelectCheckbox
                    checked={selectedKeys.has(k)}
                    onChange={() => onToggleSelectOne(k)}
                    label={`Select ${dateLabel}`}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {dateLabel}
                </span>
                {o.myRsvp && <RsvpStatusPill status={o.myRsvp.status} />}
                {isPastOcc && <span className="text-muted">past</span>}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function SeriesSharedDetails({ event }: { event: CalendarEventRow }) {
  const mapsHref = (() => {
    if (event.location.lat != null && event.location.lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${event.location.lat},${event.location.lng}`;
    }
    const q = event.location.address || event.location.name;
    return q
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
      : null;
  })();

  return (
    <div className="space-y-2 rounded-lg bg-surface-inset p-3 text-xs">
      <p className="font-medium text-foreground">Shared across all dates</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
        <span>
          <Clock className="mr-1 inline size-3" />
          Arrive {event.arriveMinutesBefore} min before
        </span>
        {event.location.name && (
          <span>
            <MapPin className="mr-1 inline size-3" />
            {event.location.name}
          </span>
        )}
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            Open in Maps
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      {event.notes && (
        <p className="whitespace-pre-wrap rounded-md bg-surface p-2 text-foreground">
          {event.notes}
        </p>
      )}
    </div>
  );
}

function SeriesOccurrenceRow({
  event,
  viewerIsCoach,
  onOptimisticRsvp,
  onServerError,
  onEdit,
}: {
  event: CalendarEventRow;
  viewerIsCoach: boolean;
  onOptimisticRsvp: (
    eventId: string,
    occurrenceDate: string,
    status: "yes" | "maybe" | "no" | null,
  ) => void;
  onServerError: () => void;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const startMs = new Date(event.startsAt).getTime();
  const isPast = startMs <= Date.now();
  const dateLabel = new Date(event.startsAt).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const totalRespondents =
    event.rsvpCounts.yes + event.rsvpCounts.no + event.rsvpCounts.maybe;

  function changeRsvp(status: "yes" | "no" | "maybe" | null) {
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
        "rounded-md " + (isPast ? "opacity-50" : "")
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate text-foreground">
          {dateLabel}
        </span>
        {!isPast && (
          <RsvpButtons
            pending={pending}
            onPick={changeRsvp}
            activeStatus={event.myRsvp?.status ?? null}
            visibility="always"
          />
        )}
        {isPast && event.myRsvp && (
          <RsvpStatusPill status={event.myRsvp.status} />
        )}
        <span className="text-muted">
          {event.rsvpCounts.yes} going · {event.rsvpCounts.maybe} maybe ·{" "}
          {event.rsvpCounts.no} can&rsquo;t
        </span>
        {viewerIsCoach && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit this date"
            className="rounded-md p-1 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {isPast && <span className="text-muted">past</span>}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Hide details" : "Show details"}
          title={expanded ? "Hide details" : "See attendees and details"}
          className="rounded-md p-1 text-muted hover:bg-surface-inset hover:text-foreground"
        >
          <ChevronDown
            className={
              "size-3.5 transition-transform " + (expanded ? "rotate-180" : "")
            }
          />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border px-2 pb-2">
          <EventCardDetail
            event={event}
            isPast={isPast}
            onOptimisticRsvp={onOptimisticRsvp}
            onServerError={onServerError}
            totalRespondents={totalRespondents}
            hideOwnRsvp
            hideSharedDetails
          />
        </div>
      )}
    </li>
  );
}

function EventCardDetail({
  event,
  isPast,
  onOptimisticRsvp,
  onServerError,
  totalRespondents,
  hideOwnRsvp = false,
  hideSharedDetails = false,
}: {
  event: CalendarEventRow;
  isPast: boolean;
  onOptimisticRsvp: (
    eventId: string,
    occurrenceDate: string,
    status: "yes" | "maybe" | "no" | null,
  ) => void;
  onServerError: () => void;
  totalRespondents: number;
  /** Skip the "Your RSVP" toggle row — useful when the parent already
   *  surfaces RSVP controls (e.g. an expanded series occurrence whose
   *  buttons sit directly above this panel). */
  hideOwnRsvp?: boolean;
  /** Skip the arrival-time, map, and notes rows — useful when the
   *  parent already surfaces them once for the series (so they don't
   *  duplicate per occurrence in an expanded series view). */
  hideSharedDetails?: boolean;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [attendees, setAttendees] = useState<CalendarAttendeeRow[] | null>(null);
  const [showAttendees, setShowAttendees] = useState(false);

  function setRsvp(status: "yes" | "no" | "maybe") {
    if (isPast) return;
    const occurrenceDate = new Date(event.startsAt).toISOString().slice(0, 10);
    const nextStatus =
      event.myRsvp?.status === status ? null : status;
    onOptimisticRsvp(event.id, occurrenceDate, nextStatus);
    startTransition(async () => {
      const res =
        nextStatus == null
          ? await clearRsvpAction(event.id, occurrenceDate)
          : await setRsvpAction({
              eventId: event.id,
              occurrenceDate,
              status: nextStatus,
              note: null,
            });
      if (!res.ok) {
        toast(res.error, "error");
        onServerError();
      }
    });
  }

  async function loadAttendees() {
    setShowAttendees(true);
    if (attendees) return;
    // Pass the row's occurrence date so a series-expanded view shows the
    // RSVPs for THIS date only, not every date in the series merged.
    const res = await listEventAttendeesAction(event.id, event.occurrenceDate);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    setAttendees(res.attendees);
  }

  const mapsHref = (() => {
    if (event.location.lat != null && event.location.lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${event.location.lat},${event.location.lng}`;
    }
    const q = event.location.address || event.location.name;
    return q
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
      : null;
  })();

  const mapsEmbedSrc = (() => {
    if (event.location.lat != null && event.location.lng != null) {
      return `https://maps.google.com/maps?q=${event.location.lat},${event.location.lng}&z=15&output=embed`;
    }
    const q = event.location.address || event.location.name;
    return q
      ? `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`
      : null;
  })();

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
      {!hideSharedDetails && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
            <span>
              <Clock className="mr-1 inline size-3" />
              Arrive {event.arriveMinutesBefore} min before
            </span>
            {event.opponent && <span>vs. {event.opponent}</span>}
            {event.homeAway && (
              <span className="capitalize">{event.homeAway}</span>
            )}
          </div>

          {mapsEmbedSrc && (
            <div className="overflow-hidden rounded-lg ring-1 ring-border">
              <iframe
                src={mapsEmbedSrc}
                title={`Map of ${event.location.name ?? event.location.address ?? "event location"}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block h-40 w-full sm:h-48"
              />
            </div>
          )}

          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <MapPin className="size-3.5" />
              Open in Maps
              <ExternalLink className="size-3" />
            </a>
          )}

          {event.notes && (
            <p className="whitespace-pre-wrap rounded-lg bg-surface-inset p-3 text-xs text-foreground">
              {event.notes}
            </p>
          )}
        </>
      )}

      {!isPast && !hideOwnRsvp && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Your RSVP</p>
          <div className="flex gap-2">
            {(["yes", "maybe", "no"] as const).map((s) => {
              const active = event.myRsvp?.status === s;
              const labels = { yes: "Going", maybe: "Maybe", no: "Can't go" };
              const colors = {
                yes: "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800",
                maybe:
                  "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
                no: "bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-100 dark:ring-red-800",
              };
              return (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  onClick={() => setRsvp(s)}
                  className={
                    "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition " +
                    (active
                      ? colors[s]
                      : "bg-surface text-muted ring-border hover:bg-surface-inset")
                  }
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
            {event.rsvpCounts.yes}
          </span>{" "}
          going ·{" "}
          <span className="font-semibold text-amber-700 dark:text-amber-300">
            {event.rsvpCounts.maybe}
          </span>{" "}
          maybe ·{" "}
          <span className="font-semibold text-red-700 dark:text-red-300">
            {event.rsvpCounts.no}
          </span>{" "}
          can&rsquo;t · {totalRespondents} responded
        </span>
        <button
          type="button"
          onClick={loadAttendees}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <Users className="size-3.5" />
          {showAttendees ? "Hide list" : "See who"}
        </button>
      </div>

      {showAttendees && (
        <AttendeeList attendees={attendees} />
      )}
    </div>
  );
}

function AttendeeList({ attendees }: { attendees: CalendarAttendeeRow[] | null }) {
  if (!attendees) {
    return <p className="text-xs text-muted">Loading…</p>;
  }
  const groups: Record<string, CalendarAttendeeRow[]> = {
    yes: [],
    maybe: [],
    no: [],
    no_response: [],
  };
  for (const a of attendees) groups[a.status].push(a);
  const sections: { key: keyof typeof groups; label: string; tone: string }[] = [
    { key: "yes", label: "Going", tone: "text-emerald-700 dark:text-emerald-300" },
    { key: "maybe", label: "Maybe", tone: "text-amber-700 dark:text-amber-300" },
    { key: "no", label: "Can't go", tone: "text-red-700 dark:text-red-300" },
    { key: "no_response", label: "No response yet", tone: "text-muted" },
  ];
  return (
    <div className="space-y-2 rounded-lg bg-surface-inset p-3 text-xs">
      {sections.map((s) =>
        groups[s.key].length > 0 ? (
          <div key={s.key}>
            <p className={`font-semibold ${s.tone}`}>
              {s.label} ({groups[s.key].length})
            </p>
            <p className="mt-0.5 text-foreground">
              {groups[s.key]
                .map((a) => a.fullName ?? "Anonymous")
                .join(", ")}
            </p>
          </div>
        ) : null,
      )}
    </div>
  );
}

