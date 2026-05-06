"use client";

import Link from "next/link";
import { MessageCircle, Sparkles } from "lucide-react";
import { track } from "@/lib/analytics/track";

/**
 * Shown to non-member viewers of an example playbook in place of the
 * Messages tab content. Example previews aren't real teams, so a working
 * chat would be misleading and (worse) leak chat across previewers. Instead
 * we surface a focused "build your own playbook to chat with your team" CTA.
 *
 * If the example is publicly claimable, the primary link goes through the
 * same /copy/example/<id> flow as BuildYourOwnPlaybookCta so the new account
 * lands with this playbook already cloned. Non-claimable examples fall back
 * to a generic signup link.
 */
export function MessagesExampleCta({
  examplePlaybookId,
}: {
  examplePlaybookId?: string | null;
}) {
  const claimable = !!examplePlaybookId;
  const primaryHref = claimable
    ? `/copy/example/${examplePlaybookId}`
    : "/login?mode=signup";
  const primaryLabel = claimable ? "Make this mine — free" : "Get started — free";
  return (
    <div className="-mx-6 sm:mx-0 sm:rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface-raised to-surface-raised p-8 text-center sm:p-12">
      <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
        <MessageCircle className="size-6" aria-hidden />
      </div>
      <h3 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
        Team chat lives inside your playbook
      </h3>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
        Message your coaches, players, and parents about practice, equipment,
        and last-minute schedule changes — alongside the plays you already
        share. Free to use, fast on the sideline.
      </p>
      <Link
        href={primaryHref}
        onClick={() =>
          track({
            event: "example_cta_click",
            target: claimable ? "messages_claim_example" : "messages_signup",
            metadata: {
              surface: "messages_tab_cta",
              action: claimable ? "claim" : "signup",
              playbook_id: examplePlaybookId ?? null,
            },
          })
        }
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-base font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
      >
        <Sparkles className="size-4" aria-hidden />
        {primaryLabel}
      </Link>
    </div>
  );
}
