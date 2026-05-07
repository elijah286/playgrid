"use client";

import { useEffect, useState } from "react";

/**
 * Tracks whether the Coach Cal panel is currently open. Used by bottom-
 * nav Cal buttons to render an "active" state while the chat is up.
 *
 * The launcher dispatches `coach-cal:state-change` whenever it opens or
 * closes; we just listen for it. On first mount we read the same flag
 * the launcher itself uses (`window.__coachCalChatOpen`) so the active
 * state survives a remount mid-session.
 */
export function useCoachCalOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpen(Boolean(window.__coachCalChatOpen));
    function onChange(e: CustomEvent<{ open: boolean }>) {
      setOpen(Boolean(e.detail?.open));
    }
    window.addEventListener("coach-cal:state-change", onChange);
    return () => window.removeEventListener("coach-cal:state-change", onChange);
  }, []);
  return open;
}
