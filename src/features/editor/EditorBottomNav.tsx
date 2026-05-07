"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ClipboardList,
  Layers,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  Trophy,
  Users,
} from "lucide-react";
import { CalNavButton } from "@/features/coach-ai/CalNavButton";

/**
 * Mobile-only footer for the play editor — mirrors PlaybookBottomNav's
 * structure (Plays · Cal · Game · More) so coaches see the same nav on
 * both surfaces. Differences vs. the playbook nav:
 *
 *   - Plays  → opens the all-plays picker IN-EDITOR (parent renders a
 *              hidden controlled PlaybookPlaySearchMenu).
 *   - More   → opens a sheet with links back to the playbook's other
 *              tabs (Roster, Calendar, Messages, Formations, Practice,
 *              Results) — the editor itself doesn't host those tabs.
 */
export function EditorBottomNav({
  playbookId,
  showCoachCal,
  available,
}: {
  playbookId: string;
  showCoachCal: boolean;
  available: {
    calendar: boolean;
    games: boolean;
    practicePlans: boolean;
    messages: boolean;
  };
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const router = useRouter();

  // Prefetch the playbook page on mount so tapping "Plays" (or any
  // other tab) feels as instant as a tab toggle on the playbook page
  // itself. Next.js's automatic Link prefetching is gated by
  // viewport intersection + production mode, so explicit warming is
  // the most reliable way to get the playbook RSC into the cache
  // before the user taps. Re-runs if `playbookId` changes (rare).
  useEffect(() => {
    router.prefetch(`/playbooks/${playbookId}?tab=plays`);
    if (available.messages) {
      router.prefetch(`/playbooks/${playbookId}?tab=messages`);
    }
  }, [router, playbookId, available.messages]);

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
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface-raised shadow-[0_-1px_0_0_rgba(0,0,0,0.02)] sm:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
      >
        <NavLink
          href={`/playbooks/${playbookId}?tab=plays`}
          label="Plays"
          Icon={ListChecks}
        />
        {available.messages && (
          <NavLink
            href={`/playbooks/${playbookId}?tab=messages`}
            label="Chat"
            Icon={MessageCircle}
          />
        )}
        {showCoachCal && <CalNavButton />}
        {available.calendar && (
          <NavLink
            href={`/playbooks/${playbookId}?tab=calendar`}
            label="Calendar"
            Icon={Calendar}
          />
        )}
        <NavButton
          onClick={() => setMoreOpen(true)}
          label="More"
          Icon={MoreHorizontal}
        />
      </nav>

      {moreOpen && (
        <MoreSheet
          playbookId={playbookId}
          available={available}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </>
  );
}

function NavButton({
  onClick,
  label,
  Icon,
  isActive,
}: {
  onClick: () => void;
  label: string;
  Icon: React.ElementType;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "true" : undefined}
      className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-colors ${
        isActive ? "text-primary" : "text-muted hover:text-foreground"
      }`}
    >
      <Icon className="size-5" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

function NavLink({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight text-muted transition-colors hover:text-foreground"
    >
      <Icon className="size-5" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function MoreSheet({
  playbookId,
  available,
  onClose,
}: {
  playbookId: string;
  available: {
    calendar: boolean;
    games: boolean;
    practicePlans: boolean;
    messages: boolean;
  };
  onClose: () => void;
}) {
  const items: { label: string; href: string; Icon: React.ElementType }[] = [];
  if (available.calendar) {
    items.push({
      label: "Calendar",
      href: `/playbooks/${playbookId}?tab=calendar`,
      Icon: Calendar,
    });
  }
  // Messages is in the primary footer row when available, so it doesn't
  // appear here too (avoid duplication).
  items.push({
    label: "Roster",
    href: `/playbooks/${playbookId}?tab=roster`,
    Icon: Users,
  });
  items.push({
    label: "Formations",
    href: `/playbooks/${playbookId}?tab=formations`,
    Icon: Layers,
  });
  if (available.games) {
    items.push({
      label: "Results",
      href: `/playbooks/${playbookId}?tab=games`,
      Icon: Trophy,
    });
  }
  if (available.practicePlans) {
    items.push({
      label: "Practice Plans",
      href: `/playbooks/${playbookId}?tab=practice_plans`,
      Icon: ClipboardList,
    });
  }

  // Overflow popover — anchored above the More button (right-bottom),
  // sized to its content. Mirrors PlaybookBottomNav's MoreSheet.
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
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 56px)",
        }}
      >
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            role="menuitem"
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
          >
            <it.Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 text-left">{it.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
