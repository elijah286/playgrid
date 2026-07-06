"use client";

import { useEffect, useState } from "react";

/** Whether an element is a text-entry surface that raises the soft keyboard. */
export function isEditableElement(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    // Text-entry input types raise the keyboard; button-like ones don't.
    return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(type);
  }
  return false;
}

/** Minimum shrink (px) of the visual viewport we treat as "keyboard present",
 *  above URL-bar jitter and clear of a no-shrink hardware keyboard. */
const KEYBOARD_INSET_FLOOR = 120;

/**
 * Pure decision: is the soft keyboard open, given the focused element and the
 * two viewport heights? Kept separate from the hook so it's unit-testable
 * without a DOM-render harness.
 *
 *   - Requires an editable element to be focused (nothing else raises the
 *     keyboard).
 *   - When a visual-viewport height is available, also requires it to have
 *     shrunk past the floor — the keyboard's footprint. This rules out a
 *     hardware keyboard (iPad/desktop), which focuses a field but shrinks
 *     nothing.
 *   - When no visual-viewport height is available (older browsers), focus
 *     alone is the signal.
 */
export function computeSoftKeyboardOpen(args: {
  activeElement: Element | null;
  layoutViewportHeight: number;
  visualViewportHeight: number | null;
}): boolean {
  if (!isEditableElement(args.activeElement)) return false;
  if (args.visualViewportHeight == null) return true;
  return args.layoutViewportHeight - args.visualViewportHeight > KEYBOARD_INSET_FLOOR;
}

/**
 * True while the on-screen (soft) keyboard is open on a touch device.
 *
 * Used to slide the mobile bottom nav out of the way while a coach is
 * typing — a tab bar wedged between the composer and the keyboard is the
 * one strip of screen the user isn't using for navigation, and tapping it
 * mid-message would discard their draft. Native iOS/Android and every chat
 * app (iMessage, WhatsApp, ChatGPT) hide bottom navigation while composing;
 * this hook lets us match that.
 *
 * SSR-safe: returns false until the first client effect runs.
 */
export function useSoftKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;

    const compute = () => {
      setOpen(
        computeSoftKeyboardOpen({
          activeElement: document.activeElement,
          layoutViewportHeight: window.innerHeight,
          visualViewportHeight: vv ? vv.height : null,
        }),
      );
    };

    document.addEventListener("focusin", compute);
    document.addEventListener("focusout", compute);
    vv?.addEventListener("resize", compute);
    vv?.addEventListener("scroll", compute);
    return () => {
      document.removeEventListener("focusin", compute);
      document.removeEventListener("focusout", compute);
      vv?.removeEventListener("resize", compute);
      vv?.removeEventListener("scroll", compute);
    };
  }, []);

  return open;
}
