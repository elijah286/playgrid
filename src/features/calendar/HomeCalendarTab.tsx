"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, MapPin } from "lucide-react";
import {
  listUpcomingEventsAcrossPlaybooksAction,
  type CrossPlaybookEventRow,
} from "@/app/actions/calendar";
import { EVENT_TYPE_META } from "./eventIcons";

export function HomeCalendarTab() {
  const [events, setEvents] = useState<CrossPlaybookEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
        <Calendar className="mx-auto mb-2 size-8 text-muted" />
        <p className="text-sm font-medium text-foreground">
          No upcoming events
        </p>
        <p className="mt-1 text-xs text-muted">
          Coaches schedule practices, games, and scrimmages from a
          playbook&rsquo;s Calendar tab.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <EventRow key={e.id} event={e} />
      ))}
    </ul>
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
