"use client";

import { useEffect, useState } from "react";
import { Check, MessageCircle, Sparkles } from "lucide-react";
import { CoachAiIcon } from "./CoachAiIcon";
import { openCoachCal } from "./openCoachCal";
import { Modal } from "@/components/ui";
import { track } from "@/lib/analytics/track";

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";

/**
 * Starter prompts shown in the welcome dialog. Picked to (a) work without
 * any open playbook context, (b) span the three categories Coach Pro
 * unlocks (play design / strategy / planning), and (c) demo the
 * conversational nature instead of one-shot lookups. Clicking one opens
 * Cal with the prompt and auto-submits — the coach's first interaction
 * is something they chose, not a canned wizard.
 */
const STARTER_PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: "Draw me a curl-flat against Cover-3",
    prompt:
      "Draw me a curl-flat play designed to beat Cover-3. Include QB reads and explain the answers against each defender.",
  },
  {
    label: "What plays beat a 5-2 defense?",
    prompt:
      "What plays in my playbook are strongest against a 5-2 defense, and why? If I'm missing a high-percentage answer, suggest one.",
  },
  {
    label: "Build a 60-minute practice plan",
    prompt:
      "Help me build a 60-minute practice plan for our next practice. Ask me about my team's age, what we're focused on this week, and any plays I want to install or refine.",
  },
  {
    label: "Suggest a new play for my team",
    prompt:
      "Help me design a new play for my team. Ask me about our skill level, what kinds of looks we're seeing from defenses, and what we need most right now — then propose a play to add.",
  },
];

const FEATURES: string[] = [
  "Coach Cal — your AI coaching partner",
  "50 messages per month, included",
  "Generate plays, playbooks, and practice plans",
  "Strategy feedback vs. specific defenses",
];

/**
 * Celebration dialog shown when a coach has just upgraded to Coach Pro.
 * Renders only when /home is loaded with `?welcome=coach_pro` AND the
 * server has confirmed the user's actual entitlement is `coach_ai`
 * (page-level anti-spoof — see HomePage). The dialog itself strips the
 * `?welcome=` param from the URL on mount so a refresh / back-navigation
 * doesn't replay the celebration.
 *
 * Design goals (per the upgrade-flow audit):
 *  1. Confirm the upgrade worked — sparkle header + explicit feature list
 *  2. Make scope clear — three feature lines, not a wall of marketing
 *  3. Activate value immediately — starter prompts, coach picks one and
 *     Cal auto-runs it, agency on first contact
 */
export function WelcomeCoachProDialog() {
  // Strip ?welcome=coach_pro (and the ?from= companion marker) from the
  // URL on first mount so refresh / back-navigation can't re-trigger the
  // celebration. We keep the dialog open via `open` state — the URL strip
  // is purely about replay-safety, not visibility.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let fromCheckout = false;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("welcome") === "coach_pro") {
        // If we got here from Stripe Checkout (`from=checkout` set on the
        // success_url), fire the same `checkout_completed` analytics event
        // /account fires on `?checkout=success`. We skip /account entirely
        // for Coach Pro first-time buyers so the funnel would otherwise
        // lose the conversion event.
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
      /* SSR-safe; URL parse can't actually fail in a real browser */
    }
    if (fromCheckout) {
      track({
        event: "checkout_completed",
        target: "stripe",
        metadata: { tier: "coach_ai" },
      });
    }
    track({
      event: "coach_pro_welcome_shown",
      target: "welcome_dialog",
      metadata: { from_checkout: fromCheckout },
    });
  }, []);

  function handleClose(reason: "dismiss" | "prompt_chosen") {
    setOpen(false);
    track({
      event: "coach_pro_welcome_closed",
      target: "welcome_dialog",
      metadata: { reason },
    });
  }

  function startWithPrompt(prompt: string, promptLabel: string) {
    track({
      event: "coach_pro_welcome_prompt_click",
      target: "welcome_dialog",
      metadata: { prompt_label: promptLabel },
    });
    // openCoachCal dispatches the global `coach-cal:open` event the
    // launcher already subscribes to (see openCoachCal.ts). The
    // launcher will inject the prompt + auto-submit for entitled
    // users — which we know this user is, because the welcome dialog
    // wouldn't have rendered otherwise. We use the generic open path
    // (no entry-point id) and pass the prompt directly so we don't
    // have to pollute the entry-points registry with a one-off entry.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("coach-cal:open", {
          detail: { entryPoint: null, prompt, key: Date.now() },
        }),
      );
    }
    handleClose("prompt_chosen");
  }

  function openEmptyCal() {
    track({
      event: "coach_pro_welcome_open_cal",
      target: "welcome_dialog",
      metadata: null,
    });
    openCoachCal();
    handleClose("prompt_chosen");
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => handleClose("dismiss")}
      title="Welcome to Coach Pro"
      footer={
        <>
          <button
            type="button"
            onClick={() => handleClose("dismiss")}
            className="rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground hover:bg-surface-inset"
          >
            Maybe later
          </button>
          <button
            type="button"
            onClick={openEmptyCal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            <MessageCircle className="size-4" />
            Open Coach Cal
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Sparkle header card — visual confirmation that something
            celebratory is happening without confetti / animation
            theatrics that read as cheap in a coaching tool. */}
        <div
          className="flex items-start gap-3 rounded-xl p-3"
          style={{ background: GRADIENT }}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/70">
            <Sparkles className="size-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Upgrade confirmed
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-slate-700">
              Coach Cal is ready. Ask anything about your playbook,
              practices, or game plan.
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

        {/* Starter prompts — coach picks one, Cal opens with it and
            auto-runs. First-touch agency: they're choosing what to
            ask, not being walked through a tour. */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Try one of these to start
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTER_PROMPTS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => startWithPrompt(p.prompt, p.label)}
                className="group flex items-start gap-2 rounded-xl border border-border bg-surface-raised p-3 text-left text-[13px] leading-snug text-foreground transition hover:border-primary/40 hover:bg-primary/[0.04]"
              >
                <div
                  className="flex size-6 shrink-0 items-center justify-center rounded-md"
                  style={{ background: GRADIENT }}
                >
                  <CoachAiIcon className="size-4 text-primary" bare />
                </div>
                <span className="font-medium">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
