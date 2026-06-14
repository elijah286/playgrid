"use client";

import { useCallback, type ReactNode } from "react";

/**
 * An anchor that scrolls to an in-page target with a guaranteed, visible
 * animation — driven by requestAnimationFrame rather than CSS
 * `scroll-behavior: smooth`.
 *
 * Why JS instead of CSS: `scroll-behavior: smooth` is silently ignored by the
 * browser when the OS has "Reduce Motion" enabled, so the page hard-jumps.
 * For the hero phone the *point* of the interaction is to let the visitor SEE
 * the page travel past the sections below (discoverability), so we animate it
 * ourselves. Falls back to a normal anchor jump if JS is disabled (the href is
 * still real) or the target is missing.
 */
export function ScrollToLink({
  targetId,
  ariaLabel,
  className,
  /** Pixels of headroom above the target (matches its scroll-mt). */
  offset = 96,
  /** Animation length in ms. */
  duration = 850,
  children,
}: {
  targetId: string;
  ariaLabel?: string;
  className?: string;
  offset?: number;
  duration?: number;
  children: ReactNode;
}) {
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Honour new-tab / modifier clicks — let the browser do its thing.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = document.getElementById(targetId);
      if (!target) return; // no target → native anchor fallback
      e.preventDefault();

      const startY = window.scrollY;
      const endY = Math.max(
        0,
        startY + target.getBoundingClientRect().top - offset,
      );
      const distance = endY - startY;
      if (Math.abs(distance) < 4) return;

      // easeInOutCubic — gentle start, brisk middle, soft landing.
      const ease = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      let startTs: number | null = null;
      const step = (ts: number) => {
        if (startTs === null) startTs = ts;
        const p = Math.min((ts - startTs) / duration, 1);
        window.scrollTo(0, startY + distance * ease(p));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    [targetId, offset, duration],
  );

  return (
    <a
      href={`#${targetId}`}
      aria-label={ariaLabel}
      onClick={onClick}
      className={className}
    >
      {children}
    </a>
  );
}
