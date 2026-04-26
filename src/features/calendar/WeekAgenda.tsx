"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEventRow } from "@/app/actions/calendar";
import { EVENT_TYPE_META } from "./eventIcons";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function WeekAgenda<T extends CalendarEventRow>({
  events,
  initialDate,
  renderEvent,
}: {
  events: T[];
  initialDate?: Date;
  renderEvent: (event: T) => ReactNode;
}) {
  const [cursor, setCursor] = useState<Date>(() => startOfWeek(initialDate ?? new Date()));
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);

  const todayKey = ymd(new Date());

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const e of events) {
      // Local ymd of startsAt — e.occurrenceDate is UTC and would bump
      // late-evening events to the next day for viewers west of UTC.
      const key = ymd(new Date(e.startsAt));
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

  const rangeLabel = useMemo(() => {
    const start = days[0]!;
    const end = days[6]!;
    const sameMonth = start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();
    const startFmt = start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
    const endFmt = end.toLocaleDateString(undefined, {
      month: sameMonth ? undefined : "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startFmt} – ${endFmt}`;
  }, [days]);

  function shiftWeek(delta: number) {
    const next = new Date(cursor);
    next.setDate(cursor.getDate() + delta * 7);
    setDirection(delta > 0 ? "next" : "prev");
    setCursor(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="rounded-md p-1.5 text-muted hover:bg-surface-hover"
          aria-label="Previous week"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="text-sm font-semibold text-foreground">{rangeLabel}</div>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="rounded-md p-1.5 text-muted hover:bg-surface-hover"
          aria-label="Next week"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <ul
        key={ymd(cursor)}
        className={
          "space-y-2 " +
          (direction === "next"
            ? "calendar-slide-up"
            : direction === "prev"
              ? "calendar-slide-down"
              : "")
        }
      >
        {days.map((d) => {
          const key = ymd(d);
          const isToday = key === todayKey;
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <li
              key={key}
              className={
                "rounded-xl border bg-surface p-3 " +
                (isToday ? "border-primary" : "border-border")
              }
            >
              <div className="mb-2 flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span
                    className={
                      "text-xs font-semibold uppercase tracking-wide " +
                      (isToday ? "text-primary" : "text-muted")
                    }
                  >
                    {DAY_NAMES[d.getDay()]}
                  </span>
                  <span
                    className={
                      "text-base font-bold " +
                      (isToday ? "text-primary" : "text-foreground")
                    }
                  >
                    {d.getDate()}
                  </span>
                </div>
                {dayEvents.length === 0 && (
                  <span className="text-[11px] text-muted">No events</span>
                )}
              </div>
              {dayEvents.length > 0 && (
                <ul className="space-y-2">
                  {dayEvents.map((e) => (
                    <li key={`${e.id}:${e.occurrenceDate}`}>
                      {renderEvent(e)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CompactEventChip({ event }: { event: CalendarEventRow }) {
  const meta = EVENT_TYPE_META[event.type];
  const Icon = meta.icon;
  const time = new Date(event.startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-inset px-2 py-1.5 text-xs">
      <span
        className={
          "inline-flex size-6 shrink-0 items-center justify-center rounded ring-1 " +
          meta.chipActive
        }
      >
        <Icon className="size-3" />
      </span>
      <span className="truncate font-medium text-foreground">{event.title}</span>
      <span className="ml-auto shrink-0 text-muted">{time}</span>
    </div>
  );
}

function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
