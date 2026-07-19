"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
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
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

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

  const canCreate = coachable.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Schedule</h1>
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

      {days.length === 0 ? (
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
