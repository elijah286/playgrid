"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { logHeroExampleClickAction } from "@/app/actions/admin-examples";

/**
 * Hero-tile companion CTA. The hero tile itself opens its own
 * playbook on click — this button routes coaches to the full examples
 * gallery so they can browse across variants and ages instead of
 * being railroaded into the one example we happen to show.
 *
 * Click is logged with the currently-shown playbookId so the
 * marketing-hero CTR metric still has a referent (the example that
 * was on screen when the click happened), even though the
 * destination changed. Fire-and-forget — never block the navigation
 * on a tracking round-trip.
 */
export function HeroPlaybookCta({ playbookId }: { playbookId: string }) {
  return (
    <Link
      href="/examples"
      onClick={() => {
        void logHeroExampleClickAction(playbookId);
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-surface-inset"
    >
      See more example playbooks
      <ArrowRight className="size-4" />
    </Link>
  );
}
