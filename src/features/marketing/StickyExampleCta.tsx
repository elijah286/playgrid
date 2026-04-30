"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { track } from "@/lib/analytics/track";

const DISMISS_KEY = "playgrid:sticky-example-cta-dismissed";

/**
 * Always-visible sticky bar shown on desktop when an unauthenticated visitor
 * is browsing an example playbook (or one of its plays / print preview).
 * The bottom <BuildYourOwnPlaybookCta> card only fires for visitors who
 * scroll all the way through; this complements it by guaranteeing a CTA
 * stays in view above the fold on long pages.
 *
 * Hidden on mobile (where the in-header "Make this mine" pill is already
 * thumb-reachable above the fold) and respects a session dismissal so the
 * bar doesn't nag visitors who've made up their mind.
 */
export function StickyExampleCta({
  playbookId,
  playbookName,
}: {
  playbookId: string;
  playbookName: string;
}) {
  // Tri-state: undefined while we read sessionStorage on mount, then
  // boolean. Avoids both (a) a flash of the bar on dismissed sessions
  // and (b) the react-hooks/set-state-in-effect lint error from
  // synchronously calling setDismissed inside an effect.
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let stored = false;
    try {
      stored = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      stored = false;
    }
    // Reading from sessionStorage requires the browser, so this has to
    // run after mount. Synchronizing the result into state is the
    // intended pattern here even though the lint rule warns by default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(stored);
  }, []);

  if (dismissed !== false) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    track({
      event: "example_cta_dismiss",
      target: "sticky_desktop_bar",
      metadata: { playbook_id: playbookId },
    });
  }

  return (
    <div
      role="region"
      aria-label="Make this example playbook your own"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 hidden md:block print:hidden"
    >
      <div className="pointer-events-auto mx-auto max-w-5xl px-4 pb-3 sm:pb-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/95 to-primary px-4 py-2.5 text-white shadow-elevated backdrop-blur-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              You&rsquo;re viewing <span className="font-bold">{playbookName}</span> as
              an example.
            </p>
            <p className="truncate text-xs text-white/85">
              Make it your starting point — free, takes 10 seconds.
            </p>
          </div>
          <Link
            href={`/copy/example/${playbookId}`}
            onClick={() =>
              track({
                event: "example_cta_click",
                target: "claim_example_sticky",
                metadata: {
                  surface: "example_sticky_desktop_bar",
                  playbook_id: playbookId,
                  action: "claim",
                },
              })
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-primary transition-transform hover:-translate-y-0.5"
          >
            Make this mine
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
