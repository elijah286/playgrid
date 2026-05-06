"use client";

import { BookOpen, Calendar, Inbox } from "lucide-react";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import { openCoachCal } from "@/features/coach-ai/openCoachCal";

/**
 * Mobile-first bottom nav for the home/lobby page. Mirrors the structure
 * of `PlaybookBottomNav` but with lobby-level tabs (Playbooks, Calendar,
 * Inbox) plus a center Cal FAB. Visible only on mobile (`<sm`); the
 * existing top `HomeTabNav` takes over on tablet/desktop.
 *
 * The Cal FAB dispatches the global `coach-cal:open` event — the
 * SiteHeader's CoachAiLauncher (mounted with `acceptGlobalCommands`)
 * catches it and opens the chat.
 */
export type HomeBottomNavTab = "playbooks" | "calendar" | "inbox";

export function HomeBottomNav({
  active,
  onChange,
  showCalendar,
  inboxCount,
  inboxUrgent,
  showCoachCal,
}: {
  active: HomeBottomNavTab;
  onChange: (k: HomeBottomNavTab) => void;
  showCalendar: boolean;
  inboxCount: number;
  inboxUrgent: boolean;
  /** Render the center Cal FAB. Hidden when the user has no Cal access. */
  showCoachCal: boolean;
}) {
  type TabDef = {
    key: HomeBottomNavTab;
    label: string;
    Icon: React.ElementType;
    badge?: number;
    badgeUrgent?: boolean;
  };

  const tabs: TabDef[] = [
    { key: "playbooks", label: "Playbooks", Icon: BookOpen },
    ...(showCalendar
      ? ([{ key: "calendar" as const, label: "Calendar", Icon: Calendar }] as TabDef[])
      : []),
    {
      key: "inbox",
      label: "Inbox",
      Icon: Inbox,
      badge: inboxCount > 0 ? inboxCount : undefined,
      badgeUrgent: inboxUrgent,
    },
  ];

  return (
    <>
      <nav
        aria-label="Home sections"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface-base/95 shadow-[0_-1px_0_0_rgba(0,0,0,0.02)] backdrop-blur supports-[backdrop-filter]:bg-surface-base/80 sm:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
      >
        {tabs.map((t) => (
          <NavButton
            key={t.key}
            isActive={active === t.key}
            label={t.label}
            Icon={t.Icon}
            badge={t.badge}
            badgeUrgent={t.badgeUrgent}
            onClick={() => onChange(t.key)}
          />
        ))}
      </nav>

      {showCoachCal && (
        <button
          type="button"
          onClick={() => openCoachCal()}
          aria-label="Open Coach Cal"
          title="Coach Cal"
          className="fixed left-1/2 z-40 inline-flex size-14 -translate-x-1/2 items-center justify-center rounded-full shadow-elevated ring-2 ring-surface-base transition-transform active:scale-95 sm:hidden"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
            background: "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)",
          }}
        >
          <CoachAiIcon className="size-8" />
        </button>
      )}
    </>
  );
}

function NavButton({
  isActive,
  label,
  Icon,
  badge,
  badgeUrgent,
  onClick,
}: {
  isActive: boolean;
  label: string;
  Icon: React.ElementType;
  badge?: number;
  badgeUrgent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-colors ${
        isActive ? "text-primary" : "text-muted hover:text-foreground"
      }`}
    >
      <span className="relative inline-flex">
        <Icon className="size-5" aria-hidden />
        {typeof badge === "number" && badge > 0 && (
          <span
            className={`absolute -right-2 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none ring-2 ring-surface-base ${
              badgeUrgent ? "bg-red-600 text-white" : "bg-primary text-primary-foreground"
            }`}
            aria-label={`${badge} ${badgeUrgent ? "urgent" : ""} item${badge === 1 ? "" : "s"}`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
