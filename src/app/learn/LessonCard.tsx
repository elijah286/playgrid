"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronDown, Plus, Sparkles } from "lucide-react";
import { SPORT_VARIANT_LABELS } from "@/domain/playbook/settings";
import type { TutorialStatus } from "@/features/tutorials/engine/types";
import type { getTutorialLaunchOptions } from "@/lib/data/tutorial-launch";
import { LaunchTutorialButton } from "./LaunchTutorialButton";

const STATUS_LABEL: Record<TutorialStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  dismissed: "Dismissed",
};

const STATUS_TONE: Record<TutorialStatus, string> = {
  not_started: "bg-surface-inset text-muted",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  dismissed: "bg-surface-inset text-muted",
};

type LaunchOptions = Awaited<ReturnType<typeof getTutorialLaunchOptions>>;

/**
 * One lesson row in the Learning Center. Collapsible — the header
 * (title + summary + status badge) is always visible; the launch
 * section (per-playbook buttons, "open an example", "create a new
 * playbook") expands on click.
 *
 * Defaults to open when `defaultOpen` is true — used for the
 * most-recently-in-progress lesson, or the only available one when
 * the list is short.
 */
export function LessonCard({
  title,
  summary,
  status,
  defaultOpen = false,
  launchPlayAuthoring,
  launchOptions,
  comingSoon = false,
}: {
  title: string;
  summary: string;
  status: TutorialStatus;
  defaultOpen?: boolean;
  /** When true, render the launch section pointed at the play
   *  authoring tour (currently the only tutorial with a launcher). */
  launchPlayAuthoring?: boolean;
  launchOptions?: LaunchOptions;
  /** When true, the card is a placeholder for a future tutorial.
   *  Renders a muted "Coming soon" message instead of a launcher. */
  comingSoon?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li className="rounded-xl border border-border bg-surface-raised shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-surface-inset/40"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_TONE[status]}`}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted">{summary}</p>
        </div>
        <ChevronDown
          className={`mt-1 size-4 shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-border-light px-4 pb-4 pt-3">
          {comingSoon ? (
            <ComingSoonBody />
          ) : launchPlayAuthoring && launchOptions ? (
            <LaunchSection launchOptions={launchOptions} />
          ) : null}
        </div>
      )}
    </li>
  );
}

function ComingSoonBody() {
  return (
    <p className="text-sm leading-relaxed text-muted">
      Coming soon. We&apos;re working on this — check back next release.
    </p>
  );
}

function LaunchSection({ launchOptions }: { launchOptions: LaunchOptions }) {
  return (
    <div className="rounded-lg border border-border bg-surface-inset/40 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Start in
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        We&apos;ll create a fresh &ldquo;Tutorial play&rdquo; in the playbook
        you pick — no formation, no routes — so every step has something to do.
      </p>

      {launchOptions.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {launchOptions.map((p) => (
            <li key={p.id}>
              <LaunchTutorialButton
                playbookId={p.id}
                playbookName={p.name}
                variantLabel={p.variant ? SPORT_VARIANT_LABELS[p.variant] : null}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
        <Link
          href="/examples"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary"
        >
          <Sparkles className="size-3.5" />
          Try an example playbook
        </Link>
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary"
        >
          <Plus className="size-3.5" />
          Create a new playbook
        </Link>
      </div>

      {launchOptions.length === 0 && (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          You don&apos;t have a playbook yet. Create one first or open an
          example, then come back to start the tutorial.
        </p>
      )}
    </div>
  );
}

export type { ReactNode };
