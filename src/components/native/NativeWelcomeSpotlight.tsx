"use client";

import { useEffect, useState } from "react";
import { Bell, CloudOff, Timer, X } from "lucide-react";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { track } from "@/lib/analytics/track";

const SEEN_KEY = "playgrid:native-welcome-seen";

const FEATURES = [
  {
    icon: CloudOff,
    title: "Works offline on the sideline",
    body: "Download a playbook and every play is ready with no signal — diagrams, routes, and assignments all load instantly.",
  },
  {
    icon: Timer,
    title: "Game Mode",
    body: "Run live games with a play clock and score tracking, your playbook a tap away. The screen stays awake and taps give haptic feedback.",
  },
  {
    icon: Bell,
    title: "Game & practice reminders",
    body: "Get a heads-up before kickoff so you’re never scrambling to pull up the right plays.",
  },
];

/**
 * One-time native-app welcome that surfaces the app's native-only
 * capabilities (offline playbooks, Game Mode, reminders) right after a coach
 * first opens the installed app. Web/desktop never render it (isNativeApp
 * gate); the dismissal is persisted so it shows once. This is the
 * discoverability half of the App Store 4.2 work — the native distinction
 * exists, but a coach (or reviewer) landing on a web-like home wouldn't find
 * it without a nudge.
 */
export function NativeWelcomeSpotlight() {
  // undefined until the client checks run (native + storage need the browser),
  // so we never flash the dialog during SSR/hydration.
  const [show, setShow] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let next = false;
    if (isNativeApp()) {
      let seen = false;
      try {
        seen = localStorage.getItem(SEEN_KEY) === "1";
      } catch {
        seen = false;
      }
      next = !seen;
      if (next) {
        track({ event: "native_welcome_view", target: "native_spotlight" });
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(next);
  }, []);

  if (show !== true) return null;

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    track({ event: "native_welcome_dismiss", target: "native_spotlight" });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to the XO Gridmaker app"
      className="native-safe-top fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold leading-tight">
            You’re in the app — here’s what’s different
          </h2>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          The installed app does things the website can’t:
        </p>
        <ul className="space-y-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{f.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5">
          <button
            type="button"
            onClick={dismiss}
            className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
