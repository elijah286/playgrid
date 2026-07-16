"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Never interrupt a coach in the opening moments of a session. That window is
 * when they're orienting toward whatever they opened the app to do — and on a
 * fresh login it's already contested by the OS push dialog and the native
 * welcome spotlight. Asking here is how a coach ends up dismissing four things
 * before reaching a playbook.
 */
export const ENGAGEMENT_WARMUP_MS = 45_000;

/**
 * ...and not until they've actually gone somewhere. One navigation is the
 * cheapest honest proxy for "this coach is oriented and doing something,"
 * which a cold dashboard paint is not.
 */
export const ENGAGEMENT_MIN_NAVIGATIONS = 1;

/**
 * A peak moment: the coach just succeeded at something (saved a play with Cal,
 * printed a wristband, shared a playbook). This is the highest-yield instant to
 * ask for a rating and it bypasses the warmup — the whole point is to ask while
 * the win is fresh, rather than on the next cold load like the old nudge did.
 *
 * Dispatch with: window.dispatchEvent(new Event(ENGAGEMENT_MOMENT_EVENT))
 */
export const ENGAGEMENT_MOMENT_EVENT = "xo:engagement-moment";

/**
 * True once it is an acceptable time to interrupt this coach: either they've
 * settled into the session (warmup elapsed AND they've navigated), or they just
 * hit a peak moment. Latches — once it's a good time, a later navigation
 * doesn't make it a bad one.
 */
export function useEngagementMoment(): boolean {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const navigationsRef = useRef(-1); // first pathname effect is the mount, not a nav
  const sessionStartRef = useRef<number | null>(null);

  useEffect(() => {
    function onMoment() {
      setReady(true);
    }
    window.addEventListener(ENGAGEMENT_MOMENT_EVENT, onMoment);
    return () => window.removeEventListener(ENGAGEMENT_MOMENT_EVENT, onMoment);
  }, []);

  useEffect(() => {
    navigationsRef.current += 1;
    if (sessionStartRef.current === null) sessionStartRef.current = Date.now();
    if (ready) return undefined;
    if (navigationsRef.current < ENGAGEMENT_MIN_NAVIGATIONS) return undefined;

    // Fire when the warmup has elapsed measured from session start, not from
    // this navigation — otherwise a coach who navigates late waits twice.
    const elapsed = Date.now() - sessionStartRef.current;
    const remaining = Math.max(0, ENGAGEMENT_WARMUP_MS - elapsed);
    const timer = setTimeout(() => setReady(true), remaining);
    return () => clearTimeout(timer);
  }, [pathname, ready]);

  return ready;
}
