"use client";

import { useEffect } from "react";

/**
 * Re-disables the native rubber-band bounce for the duration of an editor
 * route. App-wide we allow the bounce (so short lists give a "nothing below"
 * cue — see globals.css), but the editor opts out: it's a focused surface
 * where bottom-bounce adds nothing, and in edit mode pull-to-refresh is
 * suppressed, so a top pull could otherwise re-tear the sticky header below
 * the status bar (the white-gap this whole rule exists to prevent).
 *
 * Adds `no-overscroll-bounce` to <html> on mount, removes it on unmount. The
 * matching CSS is gated on `.native-shell`, so this is a no-op on the web.
 */
export function EditorOverscrollLock() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("no-overscroll-bounce");
    return () => el.classList.remove("no-overscroll-bounce");
  }, []);
  return null;
}
