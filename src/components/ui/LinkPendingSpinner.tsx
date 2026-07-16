"use client";

import { useLinkStatus } from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

/**
 * Spinner shown while THIS link's navigation is in flight.
 *
 * Opening a play is a dynamic route with a server round-trip, so there's a
 * ~500ms gap between tap and paint where nothing moves and the app reads as
 * unresponsive — a coach can't tell whether their tap registered, so they tap
 * again. Next's `useLinkStatus` reports the nearest ancestor Link's pending
 * state, which is the framework's sanctioned way to show it.
 *
 * MUST be rendered inside a `<Link>` subtree; outside one, `pending` is always
 * false and this renders nothing (harmless).
 *
 * Renders nothing until pending, so there is no cost to the idle case.
 */
export function LinkPendingSpinner({
  /** Overlay the whole link (tiles/cards). Otherwise renders inline (buttons). */
  overlay = false,
  className,
}: {
  overlay?: boolean;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  if (overlay) {
    return (
      <span
        aria-hidden
        // A soft scrim so the spinner reads on any tile artwork, without
        // hiding what was tapped — the coach should still see their target.
        className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-surface/45 backdrop-blur-[1px] ${className ?? ""}`}
      >
        <Loader2 className="size-6 animate-spin text-foreground/70" />
      </span>
    );
  }

  return (
    <Loader2
      aria-hidden
      className={`size-4 shrink-0 animate-spin ${className ?? ""}`}
    />
  );
}

/**
 * Back arrow that becomes a spinner while ITS OWN navigation is pending.
 * Must be rendered inside the `<Link>` — useLinkStatus reads the nearest one.
 *
 * Same reason as above: going back is a dynamic route with a server round-trip,
 * and a button that doesn't react to a tap gets tapped again.
 */
export function BackIcon({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  const Icon = pending ? Loader2 : ArrowLeft;
  return (
    <Icon aria-hidden className={`${className ?? ""} ${pending ? "animate-spin" : ""}`} />
  );
}
