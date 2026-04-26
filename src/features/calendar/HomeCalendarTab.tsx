"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, MapPin } from "lucide-react";
import {
  listUpcomingEventsAcrossPlaybooksAction,
  type CrossPlaybookEventRow,
} from "@/app/actions/calendar";
import { EVENT_TYPE_META } from "./eventIcons";
import { MonthGrid, ymd } from "./MonthGrid";
import { WeekAgenda } from "./WeekAgenda";

type ViewKind = "list" | "week" | "month";

export function HomeCalendarTab() {
  const [events, setEvents] = useState<CrossPlaybookEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKind>("list");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  useEffect(() => {
    listUpcomingEventsAcrossPlaybooksAction().then((res) => {
      if (res.ok) {
        setEvents(res.events);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
  }, []);

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

  return (
    <div className="space-y-4">
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

      {empty && (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <Calendar className="mx-auto mb-2 size-8 text-muted" />
          <p className="text-sm font-medium text-foreground">No upcoming events</p>
          <p className="mt-1 text-xs text-muted">
            Coaches schedule practices, games, and scrimmages from a
            playbook&rsquo;s Calendar tab.
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

      {!empty && (view === "list" || (view === "month" && selectedDayKey)) && (
        <ul className="space-y-3">
          {visible.map((e) => (
            <EventRow key={`${e.id}:${e.occurrenceDate}`} event={e} />
          ))}
          {view === "month" && selectedDayKey && visible.length === 0 && (
            <li className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-xs text-muted">
              No events on this day.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function CrossPlaybookCompact({ event }: { event: CrossPlaybookEventRow }) {
  const meta = EVENT_TYPE_META[event.type];
  const Icon = meta.icon;
  const time = new Date(event.startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-inset px-2 py-1.5 text-xs hover:bg-surface-hover">
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
        <p className="truncate text-[10px] text-muted">{event.playbookName}</p>
      </div>
      <span className="shrink-0 text-muted">{time}</span>
    </div>
  );
}

function EventRow({ event }: { event: CrossPlaybookEventRow }) {
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
  const location = event.location.name
    ? event.location.address
      ? `${event.location.name} — ${event.location.address}`
      : event.location.name
    : null;
  const headline =
    event.type === "game" && event.opponent
      ? `Game vs ${event.opponent}`
      : event.type === "scrimmage" && event.opponent
        ? `Scrimmage vs ${event.opponent}`
        : event.title;

  return (
    <li>
      <Link
        href={`/playbooks/${event.playbookId}?tab=calendar`}
        className="flex items-stretch gap-3 rounded-xl bg-surface p-4 ring-1 ring-border transition-colors hover:bg-surface-hover"
      >
        <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-hover py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {dateLabel.split(",")[0]}
          </span>
          <span className="text-xl font-bold text-foreground">
            {start.getDate()}
          </span>
          <span className="text-[10px] text-muted">{timeLabel}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
                meta.chipActive
              }
            >
              <Icon className="size-3" />
              {meta.label}
            </span>
            <span className="truncate text-xs text-muted">
              {event.playbookName}
            </span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
            {headline}
          </h3>
          {location && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{location}</span>
            </p>
          )}
          {event.arriveMinutesBefore > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <Clock className="size-3" />
              Arrive {event.arriveMinutesBefore} min early
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
