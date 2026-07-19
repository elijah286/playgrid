"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  MessageCircle,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { setSelectedTeamAction } from "@/app/actions/app-shell";

export type HomeTeam = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  season: string | null;
};

export type TodayEvent = {
  id: string;
  playbookId: string;
  playbookName: string;
  playbookColor: string | null;
  type: "practice" | "game" | "scrimmage" | "other";
  title: string;
  startsAt: string;
  locationName: string | null;
  opponent: string | null;
  homeAway: "home" | "away" | "neutral" | null;
};

export type NeedsYouItem = {
  key: string;
  kind: string;
  playbookName: string;
  playbookColor: string | null;
  eventTitle: string | null;
  who: string | null;
  body: string | null;
};

const FALLBACK = "#64748B";

const TYPE_META: Record<
  TodayEvent["type"],
  { label: string; cls: string }
> = {
  practice: { label: "Practice", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  game: { label: "Game", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  scrimmage: { label: "Scrimmage", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  other: { label: "Event", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
};

function headline(e: TodayEvent): string {
  if ((e.type === "game" || e.type === "scrimmage") && e.opponent) {
    const prefix = e.homeAway === "away" ? "@" : "vs";
    return `${e.type === "scrimmage" ? "Scrimmage " : ""}${prefix} ${e.opponent}`;
  }
  return e.title;
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

function needsYouText(a: NeedsYouItem): string {
  const who = a.who?.trim() || "Someone";
  switch (a.kind) {
    case "rsvp_pending":
      return a.eventTitle ? `RSVP needed: ${a.eventTitle}` : "RSVP needed";
    case "membership":
      return `${who} wants to join`;
    case "coach_upgrade":
      return `${who} requested coach access`;
    case "roster_claim":
      return `${who} claimed a roster spot`;
    case "share":
      return a.body || `${who} shared a playbook`;
    default:
      return a.body || "Needs your attention";
  }
}

export function HomeToday({
  events,
  needsYou,
  teams,
  scoped,
  offline,
}: {
  events: TodayEvent[];
  needsYou: NeedsYouItem[];
  teams: HomeTeam[];
  scoped: boolean;
  offline: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const openTeam = (id: string) => {
    startTransition(async () => {
      await setSelectedTeamAction(id);
      router.push("/app/team");
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">Today</h1>
        <p className="text-sm text-muted">{dateLabel}</p>
      </div>

      {offline && (
        <div className="rounded-xl border border-warning/40 bg-warning-light px-3 py-2 text-xs font-medium text-foreground">
          Couldn&rsquo;t load — check your connection.
        </div>
      )}

      {/* Your teams — the direct way into a playbook's plays/roster. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Your teams
          </h2>
          {pending && <Loader2 className="size-3.5 animate-spin text-muted" aria-hidden />}
        </div>
        {teams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            No teams yet.{" "}
            <Link href="/home" className="font-semibold text-primary">
              Create a playbook
            </Link>
            .
          </div>
        ) : (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openTeam(t.id)}
                disabled={pending}
                className="flex w-40 shrink-0 flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3 text-left shadow-sm transition-colors hover:bg-surface-inset"
              >
                <span className="flex items-center justify-between">
                  <span
                    className="grid size-9 place-items-center rounded-lg text-sm font-black text-white"
                    style={{ backgroundColor: t.color || FALLBACK }}
                  >
                    {t.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-foreground">
                    {t.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {t.season || "Open team"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Up next */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
          Up next
        </h2>
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            Nothing scheduled{scoped ? " for this team" : ""}.{" "}
            <Link href="/app/schedule" className="font-semibold text-primary">
              Add an event
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => {
              const color = e.playbookColor || FALLBACK;
              const meta = TYPE_META[e.type];
              return (
                <li
                  key={e.id}
                  className="flex gap-3 rounded-xl border border-border bg-surface-raised p-3 shadow-sm"
                >
                  <span
                    className="w-1 shrink-0 self-stretch rounded"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-foreground">
                        {headline(e)}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" aria-hidden />
                        {whenLabel(e.startsAt)}
                      </span>
                      {e.locationName && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden />
                          {e.locationName}
                        </span>
                      )}
                    </div>
                    {!scoped && (
                      <span
                        className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {e.playbookName}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Needs you */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
          Needs you{needsYou.length > 0 ? ` · ${needsYou.length}` : ""}
        </h2>
        {needsYou.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
            You&rsquo;re all caught up.
          </p>
        ) : (
          <ul className="space-y-2">
            {needsYou.map((a) => {
              const color = a.playbookColor || FALLBACK;
              return (
                <li
                  key={a.key}
                  className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-raised p-3 shadow-sm"
                >
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{needsYouText(a)}</p>
                    {!scoped && (
                      <span
                        className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {a.playbookName}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <QuickAction href="/app/schedule" Icon={Plus} label="New event" />
          <QuickAction href="/app/messages" Icon={MessageCircle} label="Message team" />
          <QuickAction href="/app/team/roster" Icon={UserPlus} label="Add player" />
          <QuickAction href="/app/schedule" Icon={Calendar} label="Schedule" />
          <QuickAction href="/app/team/roster" Icon={Users} label="Roster" />
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  href,
  Icon,
  label,
}: {
  href: string;
  Icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-inset"
    >
      <Icon className="size-4 text-muted" aria-hidden />
      {label}
    </Link>
  );
}
