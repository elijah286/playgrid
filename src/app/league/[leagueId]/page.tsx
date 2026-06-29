import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  ClipboardList,
  Megaphone,
  Palette,
  Settings,
  ShoppingBag,
  BookOpen,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import {
  getCurrentLeagueMemberships,
  isLeagueAdminRole,
  leagueAiEnabled,
} from "@/lib/league/access";
import { loadLeagueDashboard, getMyLeagues } from "@/lib/league/console";
import { leagueHasPlaybooks } from "@/lib/league/sportConfig";
import { LeagueSwitcher } from "@/features/league/LeagueSwitcher";

export const metadata: Metadata = {
  title: "League console · XO Gridmaker",
};

function GlanceCard({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function WorkflowTile({
  href,
  soon,
  icon,
  title,
  status,
}: {
  href?: string;
  soon?: boolean;
  icon: ReactNode;
  title: string;
  status: string;
}) {
  const inner = (
    <>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-inset text-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          {soon ? (
            <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] font-medium text-muted">
              Soon
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted">{status}</div>
      </div>
      {!soon ? <ChevronRight className="size-4 text-muted" /> : null}
    </>
  );
  const cls =
    "flex items-center gap-3 rounded-2xl border border-border bg-surface-raised px-4 py-3.5";
  return href && !soon ? (
    <Link href={href} className={`${cls} transition hover:bg-foreground/5`}>
      {inner}
    </Link>
  ) : (
    <div className={`${cls} opacity-75`}>{inner}</div>
  );
}

function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MoreItem({ icon, label, href }: { icon: ReactNode; label: string; href?: string }) {
  if (href) {
    return (
      <Link
        href={href}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground hover:bg-foreground/5"
      >
        {icon}
        {label}
        <ChevronRight className="ml-auto size-4 text-muted" />
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-muted opacity-75">
      {icon}
      {label}
      <span className="ml-auto rounded-full bg-surface-inset px-2 py-0.5 text-[11px] font-medium">Soon</span>
    </div>
  );
}

export default async function LeagueDashboardPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  const memberships = await getCurrentLeagueMemberships();
  if (!memberships.some((m) => m.leagueId === leagueId)) notFound();
  const isAdmin = memberships.some(
    (m) => m.leagueId === leagueId && isLeagueAdminRole(m.role),
  );
  const showLeo = isAdmin && leagueAiEnabled();

  const myLeagues = await getMyLeagues();
  const hasMultipleLeagues = myLeagues.length > 1;

  const dash = await loadLeagueDashboard(leagueId);
  if (!dash) notFound();

  const r = dash.registrations;
  const hasPlaybooks = leagueHasPlaybooks(dash.league.sport);

  const actions: string[] = [];
  if (r.needsReview > 0) actions.push(`Approve ${r.needsReview} registration${r.needsReview === 1 ? "" : "s"}`);
  if (r.unrostered > 0) actions.push(`Place ${r.unrostered} unrostered player${r.unrostered === 1 ? "" : "s"}`);
  if (dash.divisions === 0) actions.push("Add your first division");
  else if (dash.teams === 0) actions.push("Create your first team");
  if (dash.teamsWithoutCoach > 0)
    actions.push(`Assign a coach to ${dash.teamsWithoutCoach} team${dash.teamsWithoutCoach === 1 ? "" : "s"}`);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-foreground sm:px-6">
      {/* context bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {hasMultipleLeagues ? (
            <LeagueSwitcher
              leagues={myLeagues.map((l) => ({ id: l.id, name: l.name }))}
              currentId={leagueId}
            />
          ) : (
            <span className="font-medium text-foreground">{dash.league.name}</span>
          )}
        </div>
        {hasPlaybooks ? (
          <Link
            href="/playbooks"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-foreground/5"
          >
            Coach view
          </Link>
        ) : null}
      </div>

      <div className="pb-5 pt-5">
        <h1 className="text-2xl font-extrabold tracking-tight">{dash.league.name}</h1>
        <p className="mt-1 text-sm text-muted">
          <span className="capitalize">{dash.league.sport}</span> · {dash.teams}{" "}
          {dash.teams === 1 ? "team" : "teams"} · {r.total} {r.total === 1 ? "player" : "players"}
        </p>
      </div>

      {/* at a glance */}
      <div className="mb-2 text-xs font-medium text-muted">At a glance</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GlanceCard label="Registration" icon={<ClipboardList className="size-4" />}>
          {r.total === 0 ? (
            <p className="text-sm text-muted">Not open yet.</p>
          ) : (
            <>
              <div className="text-2xl font-bold tabular-nums">{r.total}</div>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-emerald-600 dark:text-emerald-400">{r.byStatus.approved + r.byStatus.rostered} active</span>
                {r.needsReview > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">{r.needsReview} to review</span>
                ) : null}
              </div>
              <Link
                href={`/league/${leagueId}/financials`}
                className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
              >
                View financials →
              </Link>
            </>
          )}
        </GlanceCard>

        <GlanceCard label="Roster gaps" icon={<Users className="size-4" />}>
          <div className="text-2xl font-bold tabular-nums">
            {r.unrostered} <span className="text-sm font-normal text-muted">unrostered</span>
          </div>
          {dash.teamsWithoutCoach > 0 ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5" />
              {dash.teamsWithoutCoach} {dash.teamsWithoutCoach === 1 ? "team needs" : "teams need"} a coach
            </div>
          ) : null}
          <div className="mt-2 text-xs text-muted">
            {dash.divisions} {dash.divisions === 1 ? "division" : "divisions"} · {dash.teams}{" "}
            {dash.teams === 1 ? "team" : "teams"}
          </div>
          {dash.teams > 0 ? (
            <Link
              href={`/league/${leagueId}/roster`}
              className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
            >
              {r.unrostered > 0 ? "Assign players →" : "Manage rosters →"}
            </Link>
          ) : null}
        </GlanceCard>

        <GlanceCard label="What's coming up" icon={<Calendar className="size-4" />}>
          {dash.upcoming.length === 0 ? (
            <p className="text-sm text-muted">No events scheduled yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {dash.upcoming.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="shrink-0 text-muted">{shortDate(e.startsAt)}</span>
                  <span className="truncate text-foreground">{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </GlanceCard>

        <GlanceCard label="Action items" icon={<AlertTriangle className="size-4" />}>
          {actions.length === 0 ? (
            <p className="text-sm text-muted">You&apos;re all caught up.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {actions.map((a) => (
                <li key={a} className="text-foreground">
                  {a}
                </li>
              ))}
            </ul>
          )}
        </GlanceCard>
      </div>

      {/* workflows */}
      <div className="mb-2 mt-8 text-xs font-medium text-muted">Workflows</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <WorkflowTile
          href={`/league/${leagueId}/registration`}
          icon={<ClipboardList className="size-5" />}
          title="Registration & payments"
          status={r.total === 0 ? "Set up registration" : `${r.total} signups`}
        />
        <WorkflowTile
          href={`/league/${leagueId}/teams`}
          icon={<Users className="size-5" />}
          title="Roster, teams & coaches"
          status={`${dash.teams} ${dash.teams === 1 ? "team" : "teams"} · ${dash.divisions} ${dash.divisions === 1 ? "division" : "divisions"}`}
        />
        <WorkflowTile
          href={`/league/${leagueId}/communications`}
          icon={<Megaphone className="size-5" />}
          title="Communications"
          status="Send an announcement"
        />
        <WorkflowTile
          href={`/league/${leagueId}/schedule`}
          icon={<Calendar className="size-5" />}
          title="Schedule & events"
          status={dash.upcoming.length > 0 ? `Next: ${dash.upcoming[0].title}` : "Add games & practices"}
        />
        <WorkflowTile
          href={`/league/${leagueId}/games`}
          icon={<Trophy className="size-5" />}
          title="Games & standings"
          status="Scores & standings"
        />
      </div>

      {/* more */}
      <div className="mb-2 mt-8 text-xs font-medium text-muted">More</div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {showLeo ? (
          <MoreItem
            icon={<Sparkles className="size-4" />}
            label="Leo (assistant)"
            href={`/league/${leagueId}/assistant`}
          />
        ) : null}
        {hasPlaybooks ? (
          <MoreItem
            icon={<BookOpen className="size-4" />}
            label="Playbooks & drills"
            href={`/league/${leagueId}/playbooks`}
          />
        ) : null}
        <MoreItem icon={<Palette className="size-4" />} label="Branding" />
        <MoreItem icon={<ShoppingBag className="size-4" />} label="Store" />
        <MoreItem
          icon={<Settings className="size-4" />}
          label="Settings"
          href={isAdmin ? `/league/${leagueId}/settings` : undefined}
        />
      </div>
    </div>
  );
}
