"use client";

import { useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { useInboxBadge } from "@/features/dashboard/InboxBadgeContext";
import { InboxDrawer } from "./InboxDrawer";

/**
 * Globally persistent inbox bell with unread-count badge. Mounted in the
 * SiteHeader (desktop, every route) and in the playbook + editor chrome
 * (mobile, where SiteHeader is hidden). Clicking opens a drawer that
 * lists alerts grouped by source playbook — so a coach inside Playbook
 * A still sees attention items from Playbook B without navigating away.
 *
 * The icon style mirrors `HomeBottomNav`'s inbox slot (`Inbox` lucide,
 * red count pill with surface-base ring) so the badge looks familiar
 * to coaches who already use the lobby tab. Color treatment is fully
 * caller-controlled via `buttonClassName` so the on-accent playbook
 * chrome can pass the luminance-aware text + hover classes it already
 * computes for its other action buttons.
 */
export function InboxBell({
  buttonClassName = "text-muted hover:text-foreground hover:bg-surface-inset",
}: {
  /** Tailwind classes for the icon button. Defaults to the SiteHeader's
   *  neutral chrome treatment. Playbook/editor chrome passes the same
   *  `${onAccent} ${onAccentHover}` pair it uses for the More menu and
   *  back arrow so the bell blends with the colored gradient. */
  buttonClassName?: string;
}) {
  const { count, urgent } = useInboxBadge();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape. Mirrors HeaderMenu's pattern so
  // the gesture is consistent with the team-options menu next to it.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const label =
    count > 0
      ? `Inbox — ${count} ${urgent ? "urgent " : ""}item${count === 1 ? "" : "s"}`
      : "Inbox";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex size-9 items-center justify-center rounded-lg transition-colors ${buttonClassName}`}
      >
        <span className="relative inline-flex">
          <Inbox className="size-5" aria-hidden />
          {count > 0 && (
            <span
              className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-surface-base"
              aria-hidden
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
      </button>
      {open && <InboxDrawer onClose={() => setOpen(false)} />}
    </div>
  );
}
