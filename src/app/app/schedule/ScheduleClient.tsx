"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Repeat,
  X,
} from "lucide-react";
import { EventSheet } from "@/features/calendar/EventSheet";
import { setRsvpAction, clearRsvpAction } from "@/app/actions/calendar";
import { setSelectedTeamAction } from "@/app/actions/app-shell";
import { ALL_TEAMS } from "@/features/preview-shell/selected-team";

export type ScheduleTeam = { id: string; name: string; color: string | null };
export type ScheduleEvent = {
  id: string;
  occurrenceDate: string;
  playbookId: string;
  playbookName: string;
  playbookColor: string | null;
  type: "practice" | "game" | "scrimmage" | "other";
  title: string;
  startsAt: string;
  durationMinutes: number;
  opponent: string | null;
  homeAway: "home" | "away" | "neutral" | null;
  locationName: string | null;
  locationAddress: string | null;
  recurring: boolean;
  myRsvp: "yes" | "no" | "maybe" | null;
};

const FALLBACK = "#64748B";

const TYPE_META: Record<ScheduleEvent["type"], { label: string; cls: string }> = {
  practice: { label: "Practice", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  game: { label: "Game", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  scrimmage: { label: "Scrimmage", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  other: { label: "Event", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
};

function headline(e: ScheduleEvent): string {
  if ((e.type === "game" || e.type === "scrimmage") && e.opponent) {
    const prefix = e.homeAway === "away" ? "@" : "vs";
    return `${e.type === "scrimmage" ? "Scrimmage " : ""}${prefix} ${e.opponent}`;
  }
  return e.title;
}

function dayKey(iso: string): string {
  return dkey(new Date(iso));
}

/** Local-timezone day key for a Date (matches dayKey(iso) for the same day). */
function dkey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** 42 cells (6 weeks) starting on the Sunday on/before the 1st of `cursor`'s month. */
function monthCells(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** The 7 dates (Sun→Sat) of the week containing `cursor`. */
function weekDates(cursor: Date): Date[] {
  const start = new Date(cursor);
  start.setDate(cursor.getDate() - cursor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type ScheduleView = "list" | "month" | "week";

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function mapsHref(e: ScheduleEvent): string | null {
  const q = e.locationAddress || e.locationName;
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function ScheduleClient({
  events: initialEvents,
  teams,
  coachable,
  selected,
}: {
  events: ScheduleEvent[];
  teams: ScheduleTeam[];
  coachable: ScheduleTeam[];
  selected: string;
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [pending, startTransition] = useTransition();
  const [sheetTeam, setSheetTeam] = useState<string | null>(null);
  const [pickTeam, setPickTeam] = useState(false);

  // View switcher (Month · Week · List) — an axis independent of the team
  // filter chips; both apply together. Choice persists across visits.
  const [view, setView] = useState<ScheduleView>("list");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => dkey(new Date()));
  useEffect(() => {
    const v = localStorage.getItem("app.schedule.view");
    if (v === "month" || v === "week" || v === "list") setView(v);
  }, []);
  const changeView = (v: ScheduleView) => {
    setView(v);
    try {
      localStorage.setItem("app.schedule.view", v);
    } catch {
      /* private mode — non-fatal */
    }
  };

  const pickChip = (value: string) => {
    if (value === selected) return;
    startTransition(async () => {
      await setSelectedTeamAction(value);
      router.refresh();
    });
  };

  const rsvp = (e: ScheduleEvent, status: "yes" | "maybe" | "no") => {
    const next = e.myRsvp === status ? null : status;
    const prev = e.myRsvp;
    setEvents((list) =>
      list.map((x) =>
        x.id === e.id && x.occurrenceDate === e.occurrenceDate ? { ...x, myRsvp: next } : x,
      ),
    );
    startTransition(async () => {
      const res = next
        ? await setRsvpAction({ eventId: e.id, occurrenceDate: e.occurrenceDate, status: next })
        : await clearRsvpAction(e.id, e.occurrenceDate);
      if (!res.ok) {
        setEvents((list) =>
          list.map((x) =>
            x.id === e.id && x.occurrenceDate === e.occurrenceDate ? { ...x, myRsvp: prev } : x,
          ),
        );
      }
    });
  };

  const startNewEvent = () => {
    if (selected !== ALL_TEAMS) setSheetTeam(selected);
    else if (coachable.length === 1) setSheetTeam(coachable[0]!.id);
    else setPickTeam(true);
  };

  const days = useMemo(() => {
    const buckets = new Map<string, ScheduleEvent[]>();
    for (const e of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const k = dayKey(e.startsAt);
      const arr = buckets.get(k) ?? [];
      arr.push(e);
      buckets.set(k, arr);
    }
    return [...buckets.values()];
  }, [events]);

  // Per-day map (Month/Week views). Keyed by local day; each day's events sorted.
  const eventsByDay = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>();
    for (const e of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const k = dayKey(e.startsAt);
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    return m;
  }, [events]);

  const canCreate = coachable.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Calendar</h1>
        {canCreate && (
          <button
            type="button"
            onClick={startNewEvent}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
          >
            <Plus className="size-4" aria-hidden />
            New event
          </button>
        )}
      </div>

      {/* Team filter chips (mirror the switcher pill) */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip active={selected === ALL_TEAMS} onClick={() => pickChip(ALL_TEAMS)} label="All teams" />
        {teams.map((t) => (
          <Chip
            key={t.id}
            active={selected === t.id}
            onClick={() => pickChip(t.id)}
            label={t.name}
            color={t.color}
          />
        ))}
        {pending && <Loader2 className="size-4 shrink-0 animate-spin self-center text-muted" aria-hidden />}
      </div>

      <ViewSwitch view={view} onChange={changeView} />

      {view === "list" &&
        (days.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            Nothing scheduled{selected !== ALL_TEAMS ? " for this team" : ""}.
            {canCreate && (
              <>
                {" "}
                <button type="button" onClick={startNewEvent} className="font-semibold text-primary">
                  Add your first event
                </button>
                .
              </>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {days.map((group) => (
              <section key={dayKey(group[0]!.startsAt)}>
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                  {dayLabel(group[0]!.startsAt)}
                </h2>
                <ul className="space-y-2">
                  {group.map((e) => (
                    <EventRow
                      key={`${e.id}:${e.occurrenceDate}`}
                      e={e}
                      scoped={selected !== ALL_TEAMS}
                      onRsvp={rsvp}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}

      {view === "month" && (
        <MonthView
          cursor={cursor}
          setCursor={setCursor}
          eventsByDay={eventsByDay}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          scoped={selected !== ALL_TEAMS}
          onRsvp={rsvp}
        />
      )}

      {view === "week" && (
        <WeekView
          cursor={cursor}
          setCursor={setCursor}
          eventsByDay={eventsByDay}
          scoped={selected !== ALL_TEAMS}
          onRsvp={rsvp}
        />
      )}

      {sheetTeam && (
        <EventSheet
          open
          playbookId={sheetTeam}
          onClose={() => setSheetTeam(null)}
          onSaved={() => {
            setSheetTeam(null);
            router.refresh();
          }}
        />
      )}

      {pickTeam && (
        <TeamPickModal
          teams={coachable}
          onPick={(id) => {
            setPickTeam(false);
            setSheetTeam(id);
          }}
          onClose={() => setPickTeam(false)}
        />
      )}
    </div>
  );
}

function ViewSwitch({
  view,
  onChange,
}: {
  view: ScheduleView;
  onChange: (v: ScheduleView) => void;
}) {
  const opts: ScheduleView[] = ["month", "week", "list"];
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-inset p-0.5">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={view === o}
          className={`rounded-md px-3.5 py-1 text-xs font-bold capitalize transition-colors ${
            view === o
              ? "bg-surface-raised text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function MonthNav({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous"
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-inset hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <span className="min-w-[9rem] text-center text-sm font-bold text-foreground">{label}</span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next"
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-inset hover:text-foreground"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Up to three team-color dots for a day cell (Month + Week headers). */
function DayDots({ events }: { events: ScheduleEvent[] }) {
  return (
    <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
      {events.slice(0, 3).map((e, i) => (
        <span
          key={i}
          className="size-1.5 rounded-full"
          style={{ backgroundColor: e.playbookColor || FALLBACK }}
          aria-hidden
        />
      ))}
    </span>
  );
}

function MonthView({
  cursor,
  setCursor,
  eventsByDay,
  selectedDay,
  setSelectedDay,
  scoped,
  onRsvp,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  eventsByDay: Map<string, ScheduleEvent[]>;
  selectedDay: string;
  setSelectedDay: (k: string) => void;
  scoped: boolean;
  onRsvp: (e: ScheduleEvent, status: "yes" | "maybe" | "no") => void;
}) {
  const today = new Date();
  const cells = monthCells(cursor);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const parts = selectedDay.split("-").map(Number);
  const selDate = new Date(
    parts[0] ?? today.getFullYear(),
    parts[1] ?? today.getMonth(),
    parts[2] ?? today.getDate(),
  );
  const selEvents = eventsByDay.get(selectedDay) ?? [];
  return (
    <div className="space-y-4">
      <MonthNav
        label={monthLabel}
        onPrev={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        onNext={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
      />
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((w, i) => (
          <div key={i} className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const k = dkey(d);
          const evs = eventsByDay.get(k) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = isSameDay(d, today);
          const isSel = k === selectedDay;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelectedDay(k)}
              aria-pressed={isSel}
              className={`flex aspect-square flex-col items-center justify-start rounded-lg pt-1.5 transition-colors ${
                isSel ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-surface-inset"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <span
                className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${
                  isToday ? "bg-primary text-white" : "text-foreground"
                }`}
              >
                {d.getDate()}
              </span>
              <DayDots events={evs} />
            </button>
          );
        })}
      </div>
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
          {selDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </h2>
        {selEvents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            Nothing scheduled.
          </p>
        ) : (
          <ul className="space-y-2">
            {selEvents.map((e) => (
              <EventRow key={`${e.id}:${e.occurrenceDate}`} e={e} scoped={scoped} onRsvp={onRsvp} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WeekView({
  cursor,
  setCursor,
  eventsByDay,
  scoped,
  onRsvp,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  eventsByDay: Map<string, ScheduleEvent[]>;
  scoped: boolean;
  onRsvp: (e: ScheduleEvent, status: "yes" | "maybe" | "no") => void;
}) {
  const today = new Date();
  const dates = weekDates(cursor);
  const label = `${dates[0]!.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${dates[6]!.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const empty = dates.every((d) => (eventsByDay.get(dkey(d)) ?? []).length === 0);
  return (
    <div className="space-y-4">
      <MonthNav
        label={label}
        onPrev={() => {
          const d = new Date(cursor);
          d.setDate(cursor.getDate() - 7);
          setCursor(d);
        }}
        onNext={() => {
          const d = new Date(cursor);
          d.setDate(cursor.getDate() + 7);
          setCursor(d);
        }}
      />
      <div className="grid grid-cols-7 gap-1 sm:hidden">
        {dates.map((d) => {
          const evs = eventsByDay.get(dkey(d)) ?? [];
          const isToday = isSameDay(d, today);
          return (
            <div key={dkey(d)} className="flex flex-col items-center gap-0.5 py-1.5">
              <span className="text-[9px] font-bold uppercase text-muted">
                {WEEKDAY_INITIALS[d.getDay()]}
              </span>
              <span
                className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${
                  isToday ? "bg-primary text-white" : "text-foreground"
                }`}
              >
                {d.getDate()}
              </span>
              <DayDots events={evs} />
            </div>
          );
        })}
      </div>
      {/* Desktop (sm:+): an hourly time grid. Mobile: the day-grouped list. */}
      <div className="hidden sm:block">
        <WeekGrid dates={dates} eventsByDay={eventsByDay} />
      </div>
      {empty ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted sm:hidden">
          Nothing scheduled this week.
        </p>
      ) : (
        <div className="space-y-4 sm:hidden">
          {dates.map((d) => {
            const evs = eventsByDay.get(dkey(d)) ?? [];
            if (evs.length === 0) return null;
            return (
              <section key={dkey(d)}>
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                  {d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </h2>
                <ul className="space-y-2">
                  {evs.map((e) => (
                    <EventRow key={`${e.id}:${e.occurrenceDate}`} e={e} scoped={scoped} onRsvp={onRsvp} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

const HOUR_PX = 44;

function hourLabel(h: number): string {
  const hr = ((h + 11) % 12) + 1;
  return `${hr} ${h < 12 ? "AM" : "PM"}`;
}

/** The [startHour, endHour) window to show, derived from the week's events and
 *  clamped to a sensible minimum span. */
function weekHourWindow(
  dates: Date[],
  eventsByDay: Map<string, ScheduleEvent[]>,
): [number, number] {
  let min = 8;
  let max = 18;
  let seen = false;
  for (const d of dates) {
    for (const e of eventsByDay.get(dkey(d)) ?? []) {
      const s = new Date(e.startsAt);
      const startH = s.getHours();
      const end = new Date(s.getTime() + Math.max(e.durationMinutes, 30) * 60000);
      const endH = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
      if (!seen) {
        min = startH;
        max = endH;
        seen = true;
      } else {
        min = Math.min(min, startH);
        max = Math.max(max, endH);
      }
    }
  }
  min = Math.max(0, Math.min(min, 8));
  max = Math.min(24, Math.max(max, min + 6));
  return [min, max];
}

type Placed = { e: ScheduleEvent; lane: number; lanes: number };

/** Greedy interval layout: overlapping events split into side-by-side lanes. */
function layoutDay(evs: ScheduleEvent[]): Placed[] {
  const sorted = [...evs].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const laneEnd: number[] = [];
  const rows = sorted.map((e) => {
    const start = new Date(e.startsAt).getTime();
    const end = start + Math.max(e.durationMinutes, 30) * 60000;
    let lane = laneEnd.findIndex((le) => le <= start);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(end);
    } else {
      laneEnd[lane] = end;
    }
    return { e, lane };
  });
  const lanes = Math.max(1, laneEnd.length);
  return rows.map((r) => ({ ...r, lanes }));
}

/** Desktop-only hourly Week grid: 7 day-columns × hourly rows, events sized by
 *  duration and colored by team, with a "now" line on today. Scan-only (RSVP
 *  lives in the List/Month views). */
function WeekGrid({
  dates,
  eventsByDay,
}: {
  dates: Date[];
  eventsByDay: Map<string, ScheduleEvent[]>;
}) {
  const today = new Date();
  const [startHour, endHour] = weekHourWindow(dates, eventsByDay);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const bodyHeight = hours.length * HOUR_PX;
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const nowTop = ((nowMinutes - startHour * 60) / 60) * HOUR_PX;
  const nowVisible = nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <div className="flex min-w-[680px]">
        <div className="w-12 shrink-0">
          <div className="h-9 border-b border-border" />
          <div className="relative" style={{ height: bodyHeight }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-muted"
                style={{ top: i * HOUR_PX }}
              >
                {i === 0 ? "" : hourLabel(h)}
              </div>
            ))}
          </div>
        </div>
        {dates.map((d) => {
          const isToday = isSameDay(d, today);
          const placed = layoutDay(eventsByDay.get(dkey(d)) ?? []);
          return (
            <div key={dkey(d)} className="min-w-0 flex-1 border-l border-border">
              <div className="flex h-9 items-center justify-center gap-1 border-b border-border text-xs font-bold">
                <span className="text-muted">{WEEKDAY_INITIALS[d.getDay()]}</span>
                <span
                  className={`grid size-5 place-items-center rounded-full text-[11px] ${
                    isToday ? "bg-primary text-white" : "text-foreground"
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="relative" style={{ height: bodyHeight }}>
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border/50"
                    style={{ top: i * HOUR_PX }}
                    aria-hidden
                  />
                ))}
                {isToday && nowVisible && (
                  <div
                    className="absolute inset-x-0 z-10 border-t-2 border-red-500"
                    style={{ top: nowTop }}
                    aria-hidden
                  >
                    <span className="absolute -left-0.5 -top-1 size-2 rounded-full bg-red-500" />
                  </div>
                )}
                {placed.map(({ e, lane, lanes }) => {
                  const s = new Date(e.startsAt);
                  const top =
                    ((s.getHours() * 60 + s.getMinutes() - startHour * 60) / 60) * HOUR_PX;
                  const height = Math.max(
                    (Math.max(e.durationMinutes, 30) / 60) * HOUR_PX,
                    22,
                  );
                  const color = e.playbookColor || FALLBACK;
                  return (
                    <div
                      key={`${e.id}:${e.occurrenceDate}`}
                      className="absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[10px] leading-tight"
                      style={{
                        top,
                        height,
                        left: `calc(${(100 / lanes) * lane}% + 1px)`,
                        width: `calc(${100 / lanes}% - 2px)`,
                        backgroundColor: `${color}22`,
                        borderLeft: `3px solid ${color}`,
                      }}
                      title={`${headline(e)} · ${timeLabel(e.startsAt)}`}
                    >
                      <div className="truncate font-bold text-foreground">{headline(e)}</div>
                      <div className="truncate text-muted">{timeLabel(e.startsAt)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventRow({
  e,
  scoped,
  onRsvp,
}: {
  e: ScheduleEvent;
  scoped: boolean;
  onRsvp: (e: ScheduleEvent, status: "yes" | "maybe" | "no") => void;
}) {
  const color = e.playbookColor || FALLBACK;
  const meta = TYPE_META[e.type];
  const started = new Date(e.startsAt).getTime() < Date.now();
  const maps = mapsHref(e);
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-surface-raised p-3 shadow-sm">
      <span className="w-1 shrink-0 self-stretch rounded" style={{ backgroundColor: color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-bold text-foreground">{headline(e)}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span>{timeLabel(e.startsAt)}</span>
          {e.recurring && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-3" aria-hidden />
              repeats
            </span>
          )}
          {e.locationName && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {e.locationName}
            </span>
          )}
          {maps && (
            <a
              href={maps}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-semibold text-primary"
            >
              Directions
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
        {!scoped && (
          <span
            className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {e.playbookName}
          </span>
        )}
        {!started && (
          <div className="mt-2 flex gap-1.5">
            <RsvpBtn label="Going" active={e.myRsvp === "yes"} tone="emerald" onClick={() => onRsvp(e, "yes")} />
            <RsvpBtn label="Maybe" active={e.myRsvp === "maybe"} tone="amber" onClick={() => onRsvp(e, "maybe")} />
            <RsvpBtn label="Can't" active={e.myRsvp === "no"} tone="rose" onClick={() => onRsvp(e, "no")} />
          </div>
        )}
      </div>
    </li>
  );
}

function RsvpBtn({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "emerald" | "amber" | "rose";
  onClick: () => void;
}) {
  const toneCls: Record<typeof tone, string> = {
    emerald: "bg-emerald-600 border-emerald-600",
    amber: "bg-amber-500 border-amber-500",
    rose: "bg-rose-500 border-rose-500",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
        active
          ? `${toneCls[tone]} text-white`
          : "border-border bg-surface-raised text-muted hover:text-foreground"
      }`}
    >
      {active && <Check className="size-3" aria-hidden />}
      {label}
    </button>
  );
}

function Chip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
        active
          ? "border-foreground bg-foreground text-white"
          : "border-border bg-surface-raised text-muted hover:text-foreground"
      }`}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      {label}
    </button>
  );
}

function TeamPickModal({
  teams,
  onPick,
  onClose,
}: {
  teams: ScheduleTeam[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Pick a team"
        className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-sm rounded-2xl border border-border bg-surface-raised p-3 shadow-elevated sm:inset-x-0 sm:top-1/2 sm:-translate-y-1/2"
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <h3 className="text-sm font-bold text-foreground">Which team is this event for?</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-surface-inset">
            <X className="size-4" />
          </button>
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {teams.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-surface-inset"
              >
                <span
                  className="grid size-6 place-items-center rounded-md text-[10px] font-black text-white"
                  style={{ backgroundColor: t.color || FALLBACK }}
                >
                  {t.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="font-semibold text-foreground">{t.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
