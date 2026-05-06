"use client";

import Link from "next/link";
import { ListChecks, Users } from "lucide-react";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import { openCoachCal } from "@/features/coach-ai/openCoachCal";

/**
 * Mobile-only footer for the play editor. Mirrors the bottom-nav pattern
 * coaches see on the playbook page so the editor doesn't feel like a
 * dead-end. Tapping a tab routes back to the playbook with that tab
 * pre-selected; the center Cal FAB opens Coach Cal in-place.
 *
 * Kept narrow on purpose — only Plays + Roster (always-available tabs).
 * Calendar / Messages availability is per-playbook and the editor
 * doesn't fetch playbook beta-feature config, so we leave those tabs
 * to the playbook's own bottom nav once the user navigates back.
 */
export function EditorBottomNav({
  playbookId,
  showCoachCal,
}: {
  playbookId: string;
  /** Render the Cal FAB. Hidden when the user has no Cal access. */
  showCoachCal: boolean;
}) {
  return (
    <>
      <nav
        aria-label="Playbook sections"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface-base/95 shadow-[0_-1px_0_0_rgba(0,0,0,0.02)] backdrop-blur supports-[backdrop-filter]:bg-surface-base/80 sm:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
      >
        <NavLink
          href={`/playbooks/${playbookId}?tab=plays`}
          label="Plays"
          Icon={ListChecks}
        />
        <NavLink
          href={`/playbooks/${playbookId}?tab=roster`}
          label="Roster"
          Icon={Users}
        />
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
