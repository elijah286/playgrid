"use client";

import { useMemo, useRef, useState, type TouchEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CalendarEventRow } from "@/app/actions/calendar";
import { EVENT_TYPE_META } from "./eventIcons";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKS = 5;
type MonthGridEvent = CalendarEventRow & { playbookColor?: string | null };

export function MonthGrid({
  events,
  initialDate,
  onSelectDay,
  selectedDayKey,
}: {
  events: MonthGridEvent[];
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
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [releaseRebound, setReleaseRebound] = useState(false);
  const touchStartRef = useRef<{ y: number; x: number } | null>(null);

  const todayKey = ymd(new Date());
  const today = startOfDay(new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, MonthGridEvent[]>();
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
    setDirection(delta > 0 ? "next" : "prev");
    setWeekStart(d);
  }

  function jumpTo(target: Date) {
    const next = startOfWeek(target);
    setDirection(next > weekStart ? "next" : "prev");
    setWeekStart(next);
  }

  // Vertical swipe to advance/retreat by one week. The grid follows the
  // finger with rubber-banding past the threshold; on release we either
  // commit (and let the slide animation snap the new week into place) or
  // spring back to zero.
  const SWIPE_THRESHOLD = 60;

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { y: t.clientY, x: t.clientX };
    setReleaseRebound(false);
  }

  function onTouchMove(e: TouchEvent) {
    const start = touchStartRef.current;
    const t = e.touches[0];
    if (!start || !t) return;
    const dy = t.clientY - start.y;
    const dx = t.clientX - start.x;
    // Only engage vertical drag once it's clearly vertical — lets users
    // tap-and-scroll-x without hijacking the gesture.
    if (dragOffset === null && Math.abs(dy) < 8) return;
    if (dragOffset === null && Math.abs(dx) > Math.abs(dy)) return;
    // Rubber-band past threshold so the gesture feels resistant rather
    // than letting users drag the grid arbitrarily far.
    const sign = dy < 0 ? -1 : 1;
    const mag = Math.abs(dy);
    const damped =
      mag <= SWIPE_THRESHOLD
        ? mag
        : SWIPE_THRESHOLD + (mag - SWIPE_THRESHOLD) * 0.35;
    setDragOffset(sign * damped);
  }

  function onTouchEnd() {
    const offset = dragOffset;
    touchStartRef.current = null;
    if (offset === null) return;
    if (Math.abs(offset) >= SWIPE_THRESHOLD) {
      // Drag UP (negative dy) reveals future weeks → next.
      // Drag DOWN (positive dy) reveals past weeks → prev.
      setDragOffset(null);
      shiftWeeks(offset < 0 ? 1 : -1);
    } else {
      setReleaseRebound(true);
      setDragOffset(0);
      // Clear the rebound transition flag once it's done, so a fresh drag
      // doesn't get an unwanted ease.
      window.setTimeout(() => {
        setDragOffset(null);
        setReleaseRebound(false);
      }, 220);
    }
  }

  const todayWeekStart = startOfWeek(new Date());
  const onCurrentWeek = ymd(weekStart) === ymd(todayWeekStart);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-3 sm:justify-between">
        <button
          type="button"
          onClick={() => shiftWeeks(-1)}
          className="hidden rounded-md p-1.5 text-muted hover:bg-surface-hover sm:block"
          aria-label="Previous week"
        >
          <ChevronUp className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-foreground">{rangeLabel}</div>
          {!onCurrentWeek && (
            <button
              type="button"
              onClick={() => jumpTo(new Date())}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-surface-hover"
            >
              Today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => shiftWeeks(1)}
          className="hidden rounded-md p-1.5 text-muted hover:bg-surface-hover sm:block"
          aria-label="Next week"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      <div
        className="overflow-hidden touch-pan-x"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          key={ymd(weekStart)}
          className={
            "grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border " +
            (dragOffset !== null
              ? ""
              : direction === "next"
                ? "calendar-slide-up"
                : direction === "prev"
                  ? "calendar-slide-down"
                  : "")
          }
          style={
            dragOffset !== null
              ? {
                  transform: `translateY(${dragOffset}px)`,
                  transition: releaseRebound
                    ? "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)"
                    : "none",
                }
              : undefined
          }
        >
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
          const isFirstOfMonth = day.date.getDate() === 1;
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay?.(isSelected ? null : day.date)}
              className={
                "flex min-h-[72px] flex-col items-stretch gap-1 bg-surface p-1 text-left transition-colors sm:min-h-[96px] sm:p-1.5 " +
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
                  // Prefer the playbook's color (matches the list view's
                  // colored cards). Fall back to the event-type dot when
                  // the event came from a single-playbook context that
                  // doesn't carry a color.
                  const color = e.playbookColor ?? null;
                  return (
                    <span
                      key={`${e.id}:${e.occurrenceDate}`}
                      title={e.title}
                      className={
                        "size-1.5 rounded-full " + (color ? "" : meta.dotClass)
                      }
                      style={color ? { backgroundColor: color } : undefined}
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
                  const color = e.playbookColor ?? null;
                  return (
                    <span
                      key={`${e.id}:${e.occurrenceDate}`}
                      title={e.title}
                      className={
                        "truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ring-1 " +
                        (color ? "border-l-[3px] " : "") +
                        meta.chipActive
                      }
                      style={color ? { borderLeftColor: color } : undefined}
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
