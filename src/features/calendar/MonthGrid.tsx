"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEventRow } from "@/app/actions/calendar";
import { EVENT_TYPE_META } from "./eventIcons";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKS = 5;

export function MonthGrid({
  events,
  initialDate,
  onSelectDay,
  selectedDayKey,
}: {
  events: CalendarEventRow[];
  initialDate?: Date;
  onSelectDay?: (date: Date | null) => void;
  selectedDayKey?: string | null;
}) {
  // Rolling 5-week view anchored to the Sunday of the cursor's week.
  // Default cursor = today, so the top row is always the current week
  // and past days within it render dimmed. Convention follows Fantastical
  // / Sunsama style "rolling month" rather than a strict calendar month.
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(initialDate ?? new Date()),
  );

  const todayKey = ymd(new Date());
  const today = startOfDay(new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>();
    for (const e of events) {
      const key = e.occurrenceDate || ymd(new Date(e.startsAt));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    }
    return map;
  }, [events]);

  const grid = useMemo(() => buildRollingGrid(weekStart, WEEKS), [weekStart]);

  const first = grid[0]!.date;
  const last = grid[grid.length - 1]!.date;
  const sameMonth =
    first.getMonth() === last.getMonth() &&
    first.getFullYear() === last.getFullYear();
  const rangeLabel = sameMonth
    ? first.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : first.getFullYear() === last.getFullYear()
      ? `${first.toLocaleDateString(undefined, { month: "short" })} – ${last.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
      : `${first.toLocaleDateString(undefined, { month: "short", year: "numeric" })} – ${last.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;

  function shiftWeeks(delta: number) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + delta * 7);
    setWeekStart(d);
  }

  const todayWeekStart = startOfWeek(new Date());
  const onCurrentWeek = ymd(weekStart) === ymd(todayWeekStart);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftWeeks(-1)}
          className="rounded-md p-1.5 text-muted hover:bg-surface-hover"
          aria-label="Previous week"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-foreground">{rangeLabel}</div>
          {!onCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekStart(todayWeekStart)}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-surface-hover"
            >
              Today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => shiftWeeks(1)}
          className="rounded-md p-1.5 text-muted hover:bg-surface-hover"
          aria-label="Next week"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border">
        {DAYS.map((d, i) => (
          <div
            key={i}
            className="bg-surface py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted"
          >
            {d}
          </div>
        ))}
        {grid.map((day) => {
          const key = ymd(day.date);
          const isToday = key === todayKey;
          const isSelected = selectedDayKey === key;
          const isPast = day.date < today && !isToday;
          // Alternating tint by month so the boundary is visible at a
          // glance without an explicit divider.
          const monthOdd = day.date.getMonth() % 2 === 1;
          // Show "MMM 1" on the first of each month so the boundary day
          // also self-labels (helpful when month tints are subtle).
          const isFirstOfMonth = day.date.getDate() === 1;
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay?.(isSelected ? null : day.date)}
              className={
                "flex min-h-[72px] flex-col items-stretch gap-1 p-1 text-left transition-colors sm:min-h-[96px] sm:p-1.5 " +
                (monthOdd ? "bg-surface-inset " : "bg-surface ") +
                (isPast ? "opacity-40 " : "") +
                (isSelected
                  ? "ring-2 ring-inset ring-primary "
                  : "hover:bg-surface-hover ")
              }
            >
              <div className="flex items-center gap-1">
                <div
                  className={
                    "text-xs font-medium " +
                    (isToday
                      ? "inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : "text-foreground")
                  }
                >
                  {day.date.getDate()}
                </div>
                {isFirstOfMonth && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {day.date.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                )}
              </div>

              {/* Mobile: dot row. Desktop: title pills. */}
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {dayEvents.slice(0, 4).map((e) => {
                  const meta = EVENT_TYPE_META[e.type];
                  return (
                    <span
                      key={`${e.id}:${e.occurrenceDate}`}
                      title={e.title}
                      className={"size-1.5 rounded-full " + meta.dotClass}
                    />
                  );
                })}
                {dayEvents.length > 4 && (
                  <span className="text-[9px] font-medium text-muted">
                    +{dayEvents.length - 4}
                  </span>
                )}
              </div>
              <div className="hidden flex-col gap-0.5 sm:flex">
                {dayEvents.slice(0, 3).map((e) => {
                  const meta = EVENT_TYPE_META[e.type];
                  return (
                    <span
                      key={`${e.id}:${e.occurrenceDate}`}
                      title={e.title}
                      className={
                        "truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ring-1 " +
                        meta.chipActive
                      }
                    >
                      {e.title}
                    </span>
                  );
                })}
                {dayEvents.length > 3 && (
                  <span className="px-1 text-[10px] font-medium text-muted">
                    +{dayEvents.length - 3} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
  const result = startOfDay(d);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function buildRollingGrid(weekStart: Date, weeks: number): { date: Date }[] {
  const cells: { date: Date }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    cells.push({ date: d });
  }
  return cells;
}

export { ymd };
