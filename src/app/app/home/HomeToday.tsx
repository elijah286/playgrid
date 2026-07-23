"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  MessageCircle,
  Plus,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { setSelectedTeamAction } from "@/app/actions/app-shell";
import { ApprovalControls, approvalFor } from "@/app/app/alerts/ApprovalControls";
import { CreateTeamSheet } from "@/features/preview-shell/CreateTeamSheet";

export type HomeTeam = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
  season: string | null;
  role: "owner" | "editor" | "viewer";
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
  playbookId: string;
  playbookName: string;
  playbookColor: string | null;
  eventTitle: string | null;
  who: string | null;
  body: string | null;
  userId: string | null;
  claimId: string | null;
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
  const [creating, setCreating] = useState(false);
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

  // "Coach anywhere?" — owns/edits any team. Drives the whole role-aware layout
  // (same signal as the nav): coaches lead with their books + get quick actions;
  // viewers lead with the spine and get the soft "start a playbook" on-ramp.
  const isCoach = teams.some((t) => t.role === "owner" || t.role === "editor");

  return (
    // Dashboard: kept at a tidy width so the list-style cards don't stretch,
    // even though the shell now allows wider (the play grid uses that room).
    <div className="mx-auto max-w-[1200px] space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Today</h1>
        <p className="text-sm text-muted">{dateLabel}</p>
      </div>

      {offline && (
        <div className="rounded-xl border border-warning/40 bg-warning-light px-3 py-2 text-xs font-medium text-foreground">
          Couldn&rsquo;t load — check your connection.
        </div>
      )}

      {/* Coach: teams/playbook shelf leads (their books are the hero). Viewer:
          teams render BELOW the spine (schedule + updates come first). */}
      {isCoach && (
        <TeamsSection
          teams={teams}
          pending={pending}
          heading="Your teams"
          onOpen={openTeam}
          onCreate={() => setCreating(true)}
        />
      )}

      {/* Up next & Needs you sit side by side on wide screens (single column
          on mobile) — the dashboard uses the width instead of stacking. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
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
              const pair = approvalFor(a.kind, a.playbookId, a.userId, a.claimId);
              const inner = (
                <>
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
                </>
              );
              // Actionable → approve/deny inline. RSVP → open the schedule.
              // Everything else → the Alerts inbox. No more inert rows.
              if (pair) {
                return (
                  <li
                    key={a.key}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-raised p-3 shadow-sm"
                  >
                    {inner}
                    <ApprovalControls pair={pair} />
                  </li>
                );
              }
              return (
                <li key={a.key}>
                  <Link
                    href={a.kind === "rsvp_pending" ? "/app/schedule" : "/app/alerts"}
                    className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-raised p-3 shadow-sm transition-colors hover:bg-surface-inset"
                  >
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>

      {/* Viewer: their team(s) + the soft coaching on-ramp sit BELOW the spine. */}
      {!isCoach && (
        <>
          <TeamsSection
            teams={teams}
            pending={pending}
            heading={teams.length === 1 ? "Your team" : "Your teams"}
            onOpen={openTeam}
            onCreate={() => setCreating(true)}
          />
          <StartCoachingCta onStart={() => setCreating(true)} />
        </>
      )}

      {/* Quick actions — coach-only (new event, add player, …). */}
      {isCoach && (
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
      )}

      {creating && <CreateTeamSheet onClose={() => setCreating(false)} />}
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

/** The team's identity mark: its real logo when set, otherwise the initial on
 *  the team color. Mirrors the sidebar TeamSwitcher so the same team looks the
 *  same everywhere in the shell. */
function TeamCardMark({ team }: { team: HomeTeam }) {
  const color = team.color || FALLBACK;
  return (
    <span
      className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg text-sm font-black text-white"
      style={{ backgroundColor: color }}
    >
      {team.logoUrl ? (
        <Image src={team.logoUrl} alt="" fill sizes="40px" className="object-contain p-1" />
      ) : (
        team.name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}

/** The teams grid — a coach's playbook shelf (rendered on top for coaches) and a
 *  viewer's way into their team/shared playbook (rendered below the spine).
 *  Same component both places so the identity marks + colors stay consistent. */
function TeamsSection({
  teams,
  pending,
  heading,
  onOpen,
  onCreate,
}: {
  teams: HomeTeam[];
  pending: boolean;
  heading: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{heading}</h2>
        {pending && <Loader2 className="size-3.5 animate-spin text-muted" aria-hidden />}
      </div>
      {teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No teams yet.{" "}
          <button
            type="button"
            onClick={onCreate}
            className="font-semibold text-primary hover:underline"
          >
            Create a team
          </button>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpen(t.id)}
              disabled={pending}
              className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface-raised py-3 pl-4 pr-3 text-left shadow-sm transition-colors hover:bg-surface-inset disabled:opacity-60"
            >
              <span
                className="absolute inset-y-0 left-0 w-1.5"
                style={{ backgroundColor: t.color || FALLBACK }}
                aria-hidden
              />
              <TeamCardMark team={t} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">{t.name}</span>
                <span className="block truncate text-[11px] text-muted">
                  {t.season || "Open team"}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Viewer-only on-ramp (Workstream 6): a calm, opt-in nudge to create their own
 *  playbook. Creating one makes them an owner → "coach anywhere?" flips true and
 *  the full coach layout unlocks automatically. Never pushed into the nav. */
function StartCoachingCta({ onStart }: { onStart: () => void }) {
  return (
    <section className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary-light/60 to-transparent p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Sparkles className="size-4 text-primary" aria-hidden />
        Coach a team of your own?
      </div>
      <p className="mt-1 text-xs text-muted">
        Build a free playbook — the full designer and coaching toolset, in about two minutes.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dark sm:w-auto sm:px-6"
      >
        Start a playbook
      </button>
    </section>
  );
}
