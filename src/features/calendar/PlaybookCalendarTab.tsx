"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarPlus,
  ChevronDown,
  Clock,
  ExternalLink,
  MapPin,
  Pencil,
  Rss,
  Users,
} from "lucide-react";
import { Button, useToast } from "@/components/ui";
import {
  clearRsvpAction,
  getOrCreateCalendarTokenAction,
  listEventAttendeesAction,
  listEventsForPlaybookAction,
  markCalendarSeenAction,
  regenerateCalendarTokenAction,
  setRsvpAction,
  type CalendarAttendeeRow,
  type CalendarEventRow,
} from "@/app/actions/calendar";
import { SubscribeFeedModal } from "./SubscribeFeedModal";
import { EventSheet, type EventSheetInitial } from "./EventSheet";
import { EVENT_TYPE_META } from "./eventIcons";
import type { SelectedPlace } from "./PlaceAutocomplete";

type Mode = "upcoming" | "past";

export function PlaybookCalendarTab({
  playbookId,
  viewerIsCoach,
  onMarkSeen,
}: {
  playbookId: string;
  viewerIsCoach: boolean;
  onMarkSeen?: () => void;
}) {
  const { toast } = useToast();
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("upcoming");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventSheetInitial | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

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

  useEffect(() => {
    load();
    markCalendarSeenAction(playbookId)
      .then(() => onMarkSeen?.())
      .catch(() => {
        /* ignore — best effort */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId]);

  const now = Date.now();
  const partitioned = useMemo(() => {
    const upcoming: CalendarEventRow[] = [];
    const past: CalendarEventRow[] = [];
    for (const e of events) {
      const end = new Date(e.startsAt).getTime() + e.durationMinutes * 60_000;
      if (end >= now) upcoming.push(e);
      else past.push(e);
    }
    past.reverse();
    return { upcoming, past };
  }, [events, now]);

  const visibleEvents = mode === "upcoming" ? partitioned.upcoming : partitioned.past;

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
    });
    setSheetOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-border">
          {(["upcoming", "past"] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "px-3 py-1.5 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-foreground hover:bg-surface-hover")
                }
              >
                {m === "upcoming" ? "Upcoming" : "Past"}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubscribeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted ring-1 ring-border hover:bg-surface-hover hover:text-foreground"
            title="Subscribe to this calendar"
          >
            <Rss className="size-3.5" />
            Subscribe
          </button>
          {viewerIsCoach && (
            <Button variant="primary" size="sm" onClick={openCreate}>
              <CalendarPlus className="mr-1.5 size-4" />
              New event
            </Button>
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
      {!loading && !error && visibleEvents.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="text-sm font-medium text-foreground">
            No {mode === "upcoming" ? "upcoming" : "past"} events
          </p>
          {viewerIsCoach && mode === "upcoming" && (
            <p className="mt-1 text-xs text-muted">
              Tap “New event” to schedule a practice, game, or scrimmage.
            </p>
          )}
        </div>
      )}

      <ul className="space-y-3">
        {visibleEvents.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            viewerIsCoach={viewerIsCoach}
            isPast={mode === "past"}
            onEdit={() => openEdit(e)}
            onChanged={load}
          />
        ))}
      </ul>

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

function EventCard({
  event,
  viewerIsCoach,
  isPast,
  onEdit,
  onChanged,
}: {
  event: CalendarEventRow;
  viewerIsCoach: boolean;
  isPast: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const meta = EVENT_TYPE_META[event.type];
  const Icon = meta.icon;
  const [expanded, setExpanded] = useState(false);
  const startDate = new Date(event.startsAt);
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

  return (
    <li
      className={
        "rounded-2xl border border-border bg-surface-raised p-4 shadow-sm " +
        (isPast ? "opacity-60" : "")
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${meta.chipActive}`}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {event.title}
            </h3>
            <span className="text-xs text-muted">{meta.label}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {formattedDate} · {formattedTime}
            {event.durationMinutes ? ` · ${event.durationMinutes} min` : ""}
          </p>
          {event.location.name && (
            <p className="mt-0.5 truncate text-xs text-muted">
              <MapPin className="mr-1 inline size-3" />
              {event.location.name}
            </p>
          )}
        </button>
        <div className="flex items-center gap-1">
          {viewerIsCoach && !isPast && (
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
      </div>

      {expanded && (
        <EventCardDetail
          event={event}
          isPast={isPast}
          onChanged={onChanged}
          totalRespondents={totalRespondents}
        />
      )}
    </li>
  );
}

function EventCardDetail({
  event,
  isPast,
  onChanged,
  totalRespondents,
}: {
  event: CalendarEventRow;
  isPast: boolean;
  onChanged: () => void;
  totalRespondents: number;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [attendees, setAttendees] = useState<CalendarAttendeeRow[] | null>(null);
  const [showAttendees, setShowAttendees] = useState(false);

  function setRsvp(status: "yes" | "no" | "maybe") {
    if (isPast) return;
    const occurrenceDate = new Date(event.startsAt).toISOString().slice(0, 10);
    startTransition(async () => {
      // Toggle off if same status.
      if (event.myRsvp?.status === status) {
        const res = await clearRsvpAction(event.id, occurrenceDate);
        if (!res.ok) toast(res.error, "error");
        else onChanged();
        return;
      }
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

  async function loadAttendees() {
    setShowAttendees(true);
    if (attendees) return;
    const res = await listEventAttendeesAction(event.id);
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

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        <span>
          <Clock className="mr-1 inline size-3" />
          Arrive {event.arriveMinutesBefore} min before
        </span>
        {event.opponent && <span>vs. {event.opponent}</span>}
        {event.homeAway && <span className="capitalize">{event.homeAway}</span>}
      </div>

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

      {!isPast && (
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
