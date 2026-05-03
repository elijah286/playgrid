"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { CoachAiIcon } from "./CoachAiIcon";
import { track } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";
const TRIAL_GRADIENT = "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)";

type CoachCalDemo = { user: string; cal: string };

const COACH_CAL_DEMOS: CoachCalDemo[] = [
  {
    user: "Draw me a curl-flat against Cover-3.",
    cal: "Done — here's the diagram with reads. Want me to add it to your playbook?",
  },
  {
    user: "What plays beat a 5-2 defense?",
    cal: "Try Stick, Curl-Flat, and Slants — your QB has the most time on those fronts.",
  },
  {
    user: "Build a 60-min practice for Tuesday.",
    cal: "10 warm-up · 20 individual · 20 team install · 10 conditioning. Saved to Practice Plans.",
  },
  {
    user: "Schedule our game vs Riverside, Sat 2 PM.",
    cal: "Added to Calendar with a 24-hr reminder. RSVP link sent to roster.",
  },
  {
    user: "Adjust this play for a younger team.",
    cal: "Simplified routes and added a hot read. Want me to apply across the playbook?",
  },
];

function leadForPath(pathname: string | null): string {
  if (!pathname) return "help you build your playbook, plan practices, and more.";
  if (/^\/plays\/[^/]+\/edit/.test(pathname)) {
    return "draw this play, suggest counters, or tune it for your team.";
  }
  if (/^\/playbooks\/[^/]+\/print/.test(pathname)) {
    return "design call sheets and wristbands you can print today.";
  }
  if (/^\/playbooks\/[^/]+/.test(pathname)) {
    return "build out this playbook, plan practices, and schedule games.";
  }
  if (pathname === "/home" || pathname.startsWith("/home")) {
    return "build playbooks, plan practices, and run your season.";
  }
  return "help you build your playbook, plan practices, and schedule games.";
}

/**
 * Welcome chat surface shown when a non-entitled user opens Coach Cal from
 * the header icon (no specific entry-point CTA). Mirrors the entry-point
 * preview shell — Cal greeting bubble, demo strip, trial CTA, disabled
 * input — but with general path-aware copy instead of a tailored upsell.
 */
export function CoachAiHeaderPreview() {
  const pathname = usePathname();
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <div className="flex items-start gap-2">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: GRADIENT }}
          >
            <CoachAiIcon className="size-5 text-primary" bare />
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-3 py-2.5 text-sm text-foreground ring-1 ring-border">
            <p className="leading-snug">Coach Cal can {leadForPath(pathname)}</p>

            <CoachCalDemoStrip />

            <Link
              href="/pricing"
              onClick={() =>
                track({
                  event: "coach_cal_cta_click",
                  target: "header_chat_trial",
                  metadata: {
                    surface: "header_chat",
                    action: "start_trial",
                    path: pathname ?? null,
                  },
                })
              }
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold text-white shadow transition hover:opacity-90"
              style={{ background: TRIAL_GRADIENT }}
            >
              Start 7-day free trial
            </Link>
            <p className="mt-1.5 text-center text-[10px] text-muted">
              No charge today · cancel anytime
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface-raised px-3 pb-3 pt-2">
        <div className="relative">
          <textarea
            rows={2}
            disabled
            placeholder="Start your free trial to chat with Coach Cal"
            className="w-full cursor-not-allowed resize-none rounded-xl bg-surface-inset px-3 py-2 pr-24 text-sm text-foreground/40 ring-1 ring-inset ring-black/5"
          />
          <div className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-surface-raised/70 px-1.5 py-0.5 text-[10px] text-muted ring-1 ring-border">
            <Lock className="size-3" /> Trial required
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Get the full Coach Cal experience with a 7-day free trial — no charge today.
        </p>
      </div>
    </div>
  );
}

function CoachCalDemoStrip() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % COACH_CAL_DEMOS.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);
  const demo = COACH_CAL_DEMOS[idx];
  return (
    <div
      key={idx}
      className="mt-3 space-y-1.5 rounded-xl bg-surface-inset/60 p-2.5 [animation:fadein_400ms_ease-out]"
    >
      <style>{`@keyframes fadein { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }`}</style>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-2.5 py-1.5 text-[11px] leading-snug text-white">
          {demo.user}
        </div>
      </div>
      <div className="flex items-end gap-1.5">
        <div className="flex size-5 shrink-0 items-center justify-center rounded-lg" style={{ background: GRADIENT }}>
          <CoachAiIcon className="size-3 text-primary" bare />
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-raised px-2.5 py-1.5 text-[11px] leading-snug text-foreground ring-1 ring-border">
          {demo.cal}
        </div>
      </div>
      <div className="flex justify-center gap-1 pt-0.5">
        {COACH_CAL_DEMOS.map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-1 rounded-full transition-colors",
              i === idx ? "bg-primary" : "bg-muted/30",
            )}
          />
        ))}
      </div>
    </div>
  );
}
