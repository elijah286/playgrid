"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { logHeroExampleClickAction } from "@/app/actions/admin-examples";

/**
 * Thin client wrapper around the hero "Try this playbook" link that
 * fires a click-tracking event before navigating. The action is
 * fire-and-forget — we don't block the navigation on the network
 * round-trip, and a tracking failure is silent.
 */
export function HeroPlaybookCta({ playbookId }: { playbookId: string }) {
  return (
    <Link
      href={`/playbooks/${playbookId}`}
      onClick={() => {
        // Don't await — the link navigation should fire immediately and
        // tracking is best-effort. The server action returns a Promise we
        // intentionally drop on the floor.
        void logHeroExampleClickAction(playbookId);
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-surface-inset"
    >
      Try this playbook
      <ArrowRight className="size-4" />
    </Link>
  );
}
