"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2 } from "lucide-react";
import { setUxPreviewActiveAction } from "@/app/actions/ux-preview";

/**
 * Personal "which experience am I using" toggle, shown on the Account page to
 * anyone ALLOWED to preview the new UX (site admin or on the `new_shell`
 * allowlist). This is the stable, findable home for the toggle so non-admin
 * testers — who can't reach Site Admin — have somewhere to turn it on/off
 * besides the transient ribbon. It does NOT control availability/allowlist
 * (that stays admin-only in Site Admin → Overview).
 */
export function UxPreviewAccountToggle({ initialActive }: { initialActive: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [pending, startTransition] = useTransition();

  const set = (on: boolean) => {
    if (on === active) return;
    startTransition(async () => {
      await setUxPreviewActiveAction(on);
      setActive(on);
      if (on) router.push("/app/home");
      else router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-orange-light text-brand-orange">
            <FlaskConical className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold text-foreground">New UX preview</h2>
            <p className="mt-0.5 max-w-prose text-xs text-muted">
              You have early access to the redesigned navigation. Switch anytime —
              your data is the same, and this only changes what you see. Login
              always starts on the current experience.
            </p>
          </div>
        </div>

        <div className="inline-flex shrink-0 rounded-xl border border-border bg-surface p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => set(false)}
            disabled={pending}
            aria-pressed={!active}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              !active ? "bg-foreground text-surface" : "text-muted hover:text-foreground"
            }`}
          >
            Current
          </button>
          <button
            type="button"
            onClick={() => set(true)}
            disabled={pending}
            aria-pressed={active}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition-colors ${
              active ? "bg-brand-orange text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {pending && <Loader2 className="size-3 animate-spin" aria-hidden />}
            New UX
          </button>
        </div>
      </div>
    </section>
  );
}
