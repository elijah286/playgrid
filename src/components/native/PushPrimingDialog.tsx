"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  PUSH_PRIMING_EVENT,
  getPushPermission,
  requestPushPermission,
} from "@/lib/native/pushPermission";
import { track } from "@/lib/analytics/track";

const ASKED_KEY = "playgrid:push-priming-asked";

/**
 * The in-app soft-ask that stands in front of the OS push alert.
 *
 * Why a dialog in front of a dialog: iOS shows its permission alert once per
 * install, ever. A "Don't Allow" is final short of a Settings trip, so the ask
 * is worth exactly one shot and we only spend it when the coach has already
 * said yes to us. If they say no here, the OS alert never fires and the shot
 * stays unspent — we can ask again after their next game.
 *
 * It only appears on a real trigger (PUSH_PRIMING_EVENT — today, scheduling a
 * game or practice), never on a load, and never once the state is decided:
 * "granted" needs nothing, "denied" means the OS won't show the alert anyway,
 * so nagging would be pure annoyance with no path to yes.
 */
export function PushPrimingDialog() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const maybeShow = useCallback(async () => {
    try {
      if (localStorage.getItem(ASKED_KEY) === "1") return;
    } catch {
      /* storage unavailable — continue */
    }
    // Only worth asking when the OS alert is still available to us.
    if ((await getPushPermission()) !== "prompt") return;
    setShow(true);
    track({ event: "push_priming_view", target: "push_priming" });
  }, []);

  useEffect(() => {
    function onPrime() {
      void maybeShow();
    }
    window.addEventListener(PUSH_PRIMING_EVENT, onPrime);
    return () => window.removeEventListener(PUSH_PRIMING_EVENT, onPrime);
  }, [maybeShow]);

  if (!show) return null;

  /** Remember we asked, so a coach isn't primed on every single event they
   *  schedule. Only set on a terminal answer — not on the OS alert failing. */
  function rememberAsked() {
    try {
      localStorage.setItem(ASKED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function decline() {
    rememberAsked();
    track({ event: "push_priming_decline", target: "push_priming" });
    setShow(false);
  }

  async function accept() {
    if (busy) return;
    setBusy(true);
    track({ event: "push_priming_accept", target: "push_priming" });
    const granted = await requestPushPermission();
    track({
      event: granted ? "push_permission_granted" : "push_permission_denied",
      target: "push_priming",
    });
    rememberAsked();
    setBusy(false);
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Turn on game reminders"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell className="size-5" />
          </div>
          <button
            type="button"
            onClick={decline}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <h2 className="text-base font-bold leading-snug text-foreground">
          Want a heads-up before kickoff?
        </h2>
        <p className="mt-1 text-sm leading-snug text-muted">
          We&apos;ll remind you before this and every game or practice you
          schedule, so you&apos;re never scrambling to pull up the right plays.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Just a sec…" : "Yes, remind me"}
          </button>
          <button
            type="button"
            onClick={decline}
            className="flex w-full items-center justify-center rounded-xl py-2 text-sm text-muted transition hover:text-foreground"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
