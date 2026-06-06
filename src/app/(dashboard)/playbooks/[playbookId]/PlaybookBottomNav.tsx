"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Calendar,
  ClipboardList,
  GraduationCap,
  Layers,
  ListChecks,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Shield,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { CalNavButton } from "@/features/coach-ai/CalNavButton";
import { signOutAction } from "@/app/actions/auth";

/**
 * Mobile-first bottom navigation for the playbook detail page. Coaches and
 * parents use this app a lot from phones (sideline, carpool); the seven
 * top-tab labels collapse poorly into a horizontal scroll.
 *
 * Five primary slots — the surfaces that matter from the sideline:
 *   Plays · Messages · Coach Cal · Game Mode · More
 *
 * Calendar, Roster, Formations, Results, and Practice Plans all live
 * in the "More" sheet. Cal and Game aren't tabs — they're actions.
 * Tapping Cal opens the chat; tapping Game launches game mode (or
 * surfaces an upgrade prompt).
 *
 * Visible only on mobile (`<sm`). The top tab bar is hidden in the same
 * breakpoint so the two patterns don't fight for screen real estate.
 *
 * Pattern reference: TeamSnap, GameChanger, Slack, Discord, iMessage all
 * use a fixed bottom icon nav for primary actions. Web Touch targets are
 * 44px+, with `env(safe-area-inset-bottom)` padding for iPhone home-bar
 * clearance.
 */
export type PlaybookBottomNavTab =
  | "plays"
  | "formations"
  | "roster"
  | "games"
  | "calendar"
  | "practice_plans"
  | "messages";

type TabDef = {
  key: PlaybookBottomNavTab;
  label: string;
  shortLabel: string;
  Icon: React.ElementType;
  count?: number | null;
  badge?: number;
};

const PRIMARY_KEYS: PlaybookBottomNavTab[] = ["plays", "messages", "calendar"];

export function PlaybookBottomNav({
  active,
  onChange,
  available,
  counts,
  messagesUnread,
  showCoachCal,
  isAdmin = false,
}: {
  active: PlaybookBottomNavTab;
  onChange: (k: PlaybookBottomNavTab) => void;
  available: {
    calendar: boolean;
    games: boolean;
    practicePlans: boolean;
    messages: boolean;
  };
  counts: { plays: number; formations: number; roster: number; calendar: number };
  messagesUnread: number;
  /** Render the Cal action button. Hidden when the user has no Cal access. */
  showCoachCal: boolean;
  /** Site admin sees an extra "Site Admin" link in the More sheet. */
  isAdmin?: boolean;
}) {
  const allTabs: TabDef[] = [
    {
      key: "plays",
      label: "Plays",
      shortLabel: "Plays",
      Icon: ListChecks,
      count: counts.plays > 0 ? counts.plays : null,
    },
    ...(available.calendar
      ? ([
          {
            key: "calendar" as const,
            label: "Calendar",
            shortLabel: "Calendar",
            Icon: Calendar,
            count: counts.calendar > 0 ? counts.calendar : null,
          },
        ] as TabDef[])
      : []),
    ...(available.messages
      ? ([
          {
            key: "messages" as const,
            label: "Messages",
            shortLabel: "Chat",
            Icon: MessageCircle,
            badge: messagesUnread,
          },
        ] as TabDef[])
      : []),
    {
      key: "roster",
      label: "Roster",
      shortLabel: "Roster",
      Icon: Users,
      count: counts.roster > 0 ? counts.roster : null,
    },
    {
      key: "formations",
      label: "Formations",
      shortLabel: "Formations",
      Icon: Layers,
      count: counts.formations > 0 ? counts.formations : null,
    },
    ...(available.games
      ? ([
          {
            key: "games" as const,
            label: "Results",
            shortLabel: "Results",
            Icon: Trophy,
          },
        ] as TabDef[])
      : []),
    ...(available.practicePlans
      ? ([
          {
            key: "practice_plans" as const,
            label: "Practice Plans",
            shortLabel: "Practice",
            Icon: ClipboardList,
          },
        ] as TabDef[])
      : []),
  ];

  const primaryTabs = allTabs.filter((t) => PRIMARY_KEYS.includes(t.key));
  const moreTabs = allTabs.filter((t) => !PRIMARY_KEYS.includes(t.key));
  const moreActive = moreTabs.some((t) => t.key === active);
  const byKey = Object.fromEntries(
    primaryTabs.map((t) => [t.key, t]),
  ) as Partial<Record<PlaybookBottomNavTab, TabDef>>;
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the More sheet on Escape and on tab change away from the sheet.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <>
      <nav
        aria-label="Playbook sections"
        className="fixed left-0 bottom-0 z-40 flex w-screen items-stretch border-t border-border bg-surface-raised shadow-[0_-1px_0_0_rgba(0,0,0,0.02)] sm:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        {/* Order: Plays · Messages · [Cal] · Calendar · More.
            Cal is centered between team-comm and time-comm tabs so
            its svelte gradient circle reads as the visual centerpiece. */}
        {byKey.plays && (
          <NavButton
            isActive={active === byKey.plays.key}
            label={byKey.plays.shortLabel}
            Icon={byKey.plays.Icon}
            badge={byKey.plays.badge}
            onClick={() => onChange(byKey.plays!.key)}
          />
        )}
        {byKey.messages && (
          <NavButton
            isActive={active === byKey.messages.key}
            label={byKey.messages.shortLabel}
            Icon={byKey.messages.Icon}
            badge={byKey.messages.badge}
            onClick={() => onChange(byKey.messages!.key)}
          />
        )}
        {showCoachCal && <CalNavButton />}
        {byKey.calendar && (
          <NavButton
            isActive={active === byKey.calendar.key}
            label={byKey.calendar.shortLabel}
            Icon={byKey.calendar.Icon}
            badge={byKey.calendar.badge}
            onClick={() => onChange(byKey.calendar!.key)}
          />
        )}
        {moreTabs.length > 0 && (
          <NavButton
            isActive={moreActive}
            label="More"
            Icon={MoreHorizontal}
            onClick={() => setMoreOpen(true)}
          />
        )}
      </nav>

      {moreOpen && (
        <MoreSheet
          tabs={moreTabs}
          active={active}
          isAdmin={isAdmin}
          onClose={() => setMoreOpen(false)}
          onPick={(k) => {
            onChange(k);
            setMoreOpen(false);
          }}
        />
      )}
    </>
  );
}

function NavButton({
  isActive,
  label,
  Icon,
  badge,
  onClick,
}: {
  isActive: boolean;
  label: string;
  Icon: React.ElementType;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-all duration-100 active:scale-[0.94] active:bg-surface-inset ${
        isActive
          ? "text-primary"
          : "text-muted hover:text-foreground"
      }`}
    >
      <span className="relative inline-flex">
        <Icon className="size-5" aria-hidden />
        {typeof badge === "number" && badge > 0 && (
          <span
            className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-surface-base"
            aria-label={`${badge} unread`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function MoreSheet({
  tabs,
  active,
  isAdmin,
  onClose,
  onPick,
}: {
  tabs: TabDef[];
  active: PlaybookBottomNavTab;
  isAdmin: boolean;
  onClose: () => void;
  onPick: (k: PlaybookBottomNavTab) => void;
}) {
  // Overflow popover — anchored above the More button (right-bottom),
  // sized to its content. Doesn't take full width or render a backdrop
  // scrim, so it doesn't visually compete with the Cal panel when both
  // are open. An invisible click-area behind it catches taps outside
  // to dismiss. Standard mobile convention for kebab-style overflow
  // menus (Twitter, Instagram, Discord).
  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-40 sm:hidden"
        onClick={onClose}
      />
      <div
        role="menu"
        aria-label="More playbook sections"
        className="fixed right-2 z-40 w-56 animate-in slide-in-from-bottom-2 fade-in rounded-xl border border-black/10 bg-surface-raised p-1 shadow-elevated duration-150 sm:hidden"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 52px)",
        }}
      >
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="menuitem"
              onClick={() => onPick(t.key)}
              aria-current={isActive ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-surface-inset"
              }`}
            >
              <t.Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 text-left">{t.label}</span>
              {typeof t.count === "number" && t.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                    isActive ? "bg-primary/20 text-primary" : "bg-surface-inset text-muted"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
        {/* Account / Site Admin / Sign out always live in the More sheet
            on mobile — keeps the top header free of the avatar so the
            bottom toolbar owns "user pile" navigation across every
            surface. */}
        {(tabs.length > 0) && <div className="my-1 border-t border-border" />}
        <Link
          href="/account"
          role="menuitem"
          onClick={onClose}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
        >
          <User className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 text-left">Account</span>
        </Link>
        <Link
          href="/learn"
          role="menuitem"
          onClick={onClose}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
        >
          <GraduationCap className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 text-left">Learning Center</span>
        </Link>
        {isAdmin && (
          <Link
            href="/settings"
            role="menuitem"
            onClick={onClose}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
          >
            <Shield className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Site Admin</span>
          </Link>
        )}
        <form action={signOutAction}>
          <button
            type="submit"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Sign out</span>
          </button>
        </form>
      </div>
    </>
  );
}
