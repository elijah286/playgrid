"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  ClipboardList,
  Layers,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import { openCoachCal } from "@/features/coach-ai/openCoachCal";

/**
 * Mobile-first bottom navigation for the playbook detail page. Coaches and
 * parents use this app a lot from phones (sideline, carpool); the seven
 * top-tab labels collapse poorly into a horizontal scroll. This bar puts
 * the four highest-traffic surfaces in thumb range — Plays, Calendar,
 * Messages, Roster — and tucks the rest into a "More" sheet (Formations,
 * Results, Practice Plans).
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

const PRIMARY_KEYS: PlaybookBottomNavTab[] = [
  "plays",
  "calendar",
  "messages",
  "roster",
];

export function PlaybookBottomNav({
  active,
  onChange,
  available,
  counts,
  messagesUnread,
  showCoachCal,
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
  /** Render a center "Cal" FAB above the nav row that opens Coach Cal.
   *  Hidden when the user has no Cal access (no entitlement, no promo). */
  showCoachCal: boolean;
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
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface-base/95 shadow-[0_-1px_0_0_rgba(0,0,0,0.02)] backdrop-blur supports-[backdrop-filter]:bg-surface-base/80 sm:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
      >
        {primaryTabs.map((t) => (
          <NavButton
            key={t.key}
            isActive={active === t.key}
            label={t.shortLabel}
            Icon={t.Icon}
            badge={t.badge}
            onClick={() => onChange(t.key)}
          />
        ))}
        {moreTabs.length > 0 && (
          <NavButton
            isActive={moreActive}
            label="More"
            Icon={MoreHorizontal}
            onClick={() => setMoreOpen(true)}
          />
        )}
      </nav>

      {/* Center Cal FAB. Floats above the nav row, half-overlapping the
          top edge so it reads as the "primary action" against the row of
          tabs. Dispatches the global coach-cal:open event — the playbook
          header's CoachAiLauncher (acceptGlobalCommands) catches it and
          opens the panel with playbookId context. */}
      {showCoachCal && (
        <button
          type="button"
          onClick={() => openCoachCal()}
          aria-label="Open Coach Cal"
          title="Coach Cal"
          className="fixed left-1/2 z-40 inline-flex size-14 -translate-x-1/2 items-center justify-center rounded-full shadow-elevated ring-2 ring-surface-base transition-transform active:scale-95 sm:hidden"
          style={{
            bottom:
              "calc(env(safe-area-inset-bottom, 0px) + 28px)",
            background: "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)",
          }}
        >
          <CoachAiIcon className="size-8" />
        </button>
      )}

      {moreOpen && (
        <MoreSheet
          tabs={moreTabs}
          active={active}
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
      className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-colors ${
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
  onClose,
  onPick,
}: {
  tabs: TabDef[];
  active: PlaybookBottomNavTab;
  onClose: () => void;
  onPick: (k: PlaybookBottomNavTab) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="More playbook sections"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full rounded-t-2xl border-t border-border bg-surface-raised p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-2xl"
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-10 rounded-full bg-border" aria-hidden />
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">
            More sections
          </span>
          <button
            type="button"
            aria-label="Close"
            className="rounded-full p-1 text-muted hover:bg-surface-inset hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col">
          {tabs.map((t) => {
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onPick(t.key)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-base transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-surface-inset"
                }`}
              >
                <t.Icon className="size-5" aria-hidden />
                <span className="flex-1 text-left">{t.label}</span>
                {typeof t.count === "number" && t.count > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      isActive ? "bg-primary/20 text-primary" : "bg-surface-inset text-muted"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
