"use client";

import { Archive, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Name of the playbook the coach tried to archive — shown in the body. */
  playbookName: string;
  /**
   * Permanently delete the playbook. This dialog IS the confirmation step, so
   * the caller must NOT wrap this in another window.confirm().
   */
  onDelete: () => void;
};

/**
 * Shown when a free-tier coach tries to ARCHIVE a playbook. Archiving is a
 * Team Coach feature: an archived book still consumes the single free
 * playbook slot, so on the free plan it's a footgun — the slot stays spent
 * but the book looks put away, leaving the coach unable to create or claim a
 * new one. Instead of silently failing or dropping them onto a dead-end
 * paywall, we offer the two real choices: delete it to reclaim the slot, or
 * keep working in it.
 *
 * Upgrade/pricing phrasing is wrapped in `data-web-only` so it disappears on
 * native shells (App Store 3.1.3(b) compliance); native shows the plain
 * blocker only. There is no upgrade CTA button here by design — the ask is a
 * delete-or-keep decision, not an upsell.
 */
export function ArchiveLockedDialog({
  open,
  onClose,
  playbookName,
  onDelete,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative flex w-full max-w-sm flex-col items-center gap-3 rounded-xl bg-surface-raised p-6 text-center shadow-lg ring-1 ring-border">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-2 rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
          <Archive className="size-6 text-muted" />
          <p className="text-sm font-semibold text-foreground">
            Archiving is a Team Coach feature
          </p>
          <p className="text-xs text-muted">
            Free accounts include one playbook, and an archived playbook still
            takes that slot — so{" "}
            {playbookName ? <>&ldquo;{playbookName}&rdquo;</> : "this playbook"}{" "}
            can&rsquo;t be archived on the free plan. Delete it permanently to
            free the slot, or keep working in it.
            <span data-web-only>
              {" "}
              Upgrade to Team Coach ($9/mo or $99/yr) to archive playbooks.
            </span>
          </p>
          <div className="mt-1 flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex w-full items-center justify-center rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              Delete permanently
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-inset"
            >
              Continue working in it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
