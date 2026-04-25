"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEventRow } from "@/app/actions/calendar";
import { EVENT_TYPE_META } from "./eventIcons";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

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
  const [cursor, setCursor] = useState<Date>(() => {
    const base = initialDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const todayKey = ymd(new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>();
    for (const e of events) {
      const key = ymd(new Date(e.startsAt));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded-md p-1.5 text-muted hover:bg-surface-hover"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="text-sm font-semibold text-foreground">
          {monthLabel}
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded-md p-1.5 text-muted hover:bg-surface-hover"
          aria-label="Next month"
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
          const inMonth = day.date.getMonth() === cursor.getMonth();
          const isToday = key === todayKey;
          const isSelected = selectedDayKey === key;
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay?.(isSelected ? null : day.date)}
              className={
                "flex min-h-[64px] flex-col items-stretch gap-1 bg-surface p-1.5 text-left transition-colors " +
                (inMonth ? "" : "opacity-40 ") +
                (isSelected
                  ? "ring-2 ring-inset ring-primary "
                  : "hover:bg-surface-hover ")
              }
            >
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
              <div className="flex flex-wrap gap-0.5">
                {dayEvents.slice(0, 4).map((e) => {
                  const meta = EVENT_TYPE_META[e.type];
                  return (
                    <span
                      key={e.id}
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

function buildMonthGrid(firstOfMonth: Date): { date: Date }[] {
  const startWeekday = firstOfMonth.getDay();
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - startWeekday);
  const cells: { date: Date }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d });
  }
  return cells;
}

export { ymd };
