"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { setPlaySharedAction } from "@/app/actions/plays";

/**
 * Per-play sharing control (Workstream 2/6), shown on coach play cards only.
 * A shared play's pill stays quiet (revealed on hover/focus); a hidden play's
 * pill is always visible + amber so a coach can see at a glance what players
 * can't. Tapping flips plays.shared_with_players via setPlaySharedAction; the
 * RLS split does the actual viewer-side hiding. Sits above the card's Link, so
 * it stops propagation to avoid navigating into the editor.
 */
export function PlayShareToggle({
  playId,
  shared,
}: {
  playId: string;
  shared: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(shared);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={on}
      aria-label={
        on ? "Shared with players — tap to hide" : "Hidden from players — tap to share"
      }
      title={on ? "Shared with players" : "Hidden from players"}
      onClick={(e) => {
        // The card is a Link; keep the toggle from navigating into the editor.
        e.preventDefault();
        e.stopPropagation();
        const next = !on;
        setOn(next); // optimistic
        start(async () => {
          const res = await setPlaySharedAction(playId, next);
          if (!res.ok) setOn(!next); // revert on failure
          else router.refresh();
        });
      }}
      className={`absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold shadow-sm transition-opacity ${
        on
          ? "border-border bg-surface-raised/90 text-muted opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          : "border-amber-300 bg-amber-50 text-amber-700 opacity-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
      }`}
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : on ? (
        <Eye className="size-3" aria-hidden />
      ) : (
        <EyeOff className="size-3" aria-hidden />
      )}
      {on ? "Shared" : "Hidden"}
    </button>
  );
}
