"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ClipboardList,
  PlusCircle,
  Sparkles,
  Users,
} from "lucide-react";
import { Modal } from "@/components/ui";
import { track } from "@/lib/analytics/track";

const GRADIENT = "linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)";

const FEATURES: string[] = [
  "Unlimited plays and playbooks",
  "Wristbands (print + PDF, watermark-free)",
  "Invite assistant coaches to collaborate",
  "Practice plans, Game Mode, full version history",
];

type StarterAction = {
  label: string;
  description: string;
  icon: typeof PlusCircle;
  href: string;
  trackKey: string;
};

/**
 * Action-oriented starter cards for a fresh Team Coach. Each one is a
 * concrete next step the coach can do TODAY, not abstract feature
 * marketing. The destinations are existing surfaces — we're routing
 * intent, not building a new flow.
 *
 * Picked these four because they're the canonical "first hour with
 * Team Coach" actions; ordering reflects the most-common workflow
 * (build a playbook first, then add the people who use it, then put
 * the schedule on top).
 */
const STARTER_ACTIONS: StarterAction[] = [
  {
    label: "Create a new playbook",
    description: "Start fresh with unlimited plays.",
    icon: PlusCircle,
    href: "/home?create_playbook=1",
    trackKey: "create_playbook",
  },
  {
    label: "Invite an assistant coach",
    description: "Collaborate on plays and practice plans.",
    icon: Users,
    href: "/account#coach-seats",
    trackKey: "invite_coach",
  },
  {
    label: "Set up your team calendar",
    description: "Practices, games, RSVPs in one place.",
    icon: CalendarDays,
    href: "/home?tab=calendar",
    trackKey: "team_calendar",
  },
  {
    label: "Build a practice plan",
    description: "Reusable templates with timeline blocks.",
    icon: ClipboardList,
    href: "/home",
    trackKey: "practice_plan",
  },
];

/**
 * Celebration dialog shown when a coach has just subscribed to Team
 * Coach. Mirrors the WelcomeCoachProDialog shape (sparkle header,
 * feature checklist, starter-action grid, dismiss) but with action
 * cards that route to concrete next steps instead of AI starter
 * prompts — Team Coach doesn't have an AI surface to seed.
 *
 * Renders only when /home is loaded with `?welcome=team_coach` AND
 * the server has confirmed the user's actual entitlement is `coach`
 * (page-level anti-spoof — see HomePage). The dialog itself strips
 * the `?welcome=` (and `?from=`) params from the URL on mount so a
 * refresh / back-navigation doesn't replay the celebration.
 */
export function TeamCoachWelcomeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let fromCheckout = false;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("welcome") === "team_coach") {
        fromCheckout = url.searchParams.get("from") === "checkout";
        url.searchParams.delete("welcome");
        url.searchParams.delete("from");
        window.history.replaceState(
          null,
          "",
          url.pathname + (url.search || "") + url.hash,
        );
      }
    } catch {
      /* SSR-safe */
    }
    if (fromCheckout) {
      track({
        event: "checkout_completed",
        target: "stripe",
        metadata: { tier: "coach" },
      });
    }
    track({
      event: "team_coach_welcome_shown",
      target: "welcome_dialog",
      metadata: { from_checkout: fromCheckout },
    });
  }, []);

  function handleClose(reason: "dismiss" | "action_chosen") {
    setOpen(false);
    track({
      event: "team_coach_welcome_closed",
      target: "welcome_dialog",
      metadata: { reason },
    });
  }

  function go(action: StarterAction) {
    track({
      event: "team_coach_welcome_action_click",
      target: "welcome_dialog",
      metadata: { action: action.trackKey },
    });
    handleClose("action_chosen");
    router.push(action.href);
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => handleClose("dismiss")}
      title="Welcome to Team Coach"
      footer={
        <button
          type="button"
          onClick={() => handleClose("dismiss")}
          className="rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground hover:bg-surface-inset"
        >
          Got it
        </button>
      }
    >
      <div className="space-y-4">
        {/* Sparkle header confirming the purchase. Matches the
            WelcomeCoachProDialog treatment for visual consistency
            across plans; the gradient is warm amber instead of cool
            lavender so the two dialogs don't look identical. */}
        <div
          className="flex items-start gap-3 rounded-xl p-3"
          style={{ background: GRADIENT }}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/70">
            <Sparkles className="size-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Subscription confirmed
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-slate-700">
              You&rsquo;re all set. Pick a next step or jump in
              wherever feels right.
            </p>
          </div>
        </div>

        {/* What's included */}
        <ul className="space-y-1.5 text-sm">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="text-foreground">{f}</span>
            </li>
          ))}
        </ul>

        {/* Starter actions — each routes to an existing surface
            instead of building new flows. Coach picks one, dialog
            closes, page navigates. Two-column on sm+, stacked on
            mobile. */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Pick a next step
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTER_ACTIONS.map((a) => (
              <button
                key={a.trackKey}
                type="button"
                onClick={() => go(a)}
                className="group flex items-start gap-2 rounded-xl border border-border bg-surface-raised p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.04]"
              >
                <div
                  className="flex size-6 shrink-0 items-center justify-center rounded-md"
                  style={{ background: GRADIENT }}
                >
                  <a.icon className="size-4 text-amber-700" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground">
                    {a.label}
                  </div>
                  <div className="text-[11px] leading-snug text-muted">
                    {a.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
