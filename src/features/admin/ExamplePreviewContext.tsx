"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, FlaskConical, X } from "lucide-react";
import { archivePlaybookAction } from "@/app/actions/playbooks";

/**
 * Shared "read-only" state for playbook detail pages. Covers two modes:
 *
 *  - **Example preview**: a visitor is viewing a published example playbook
 *    they aren't a member of.
 *  - **Archived**: the playbook has been archived by its owner. Members
 *    still reach the page (e.g. via /home → Archived tab) but mutations
 *    must be blocked until the playbook is unarchived.
 *
 * Any component attempting a mutation calls `blockIfPreview(reason?)`. When
 * either mode is active it pops a mode-appropriate modal and returns `true`
 * (meaning "don't proceed"); otherwise it returns `false` and the caller
 * runs its real side effect. The name is kept for compatibility with
 * existing call sites.
 */

type Ctx = {
  /** True when a visitor is previewing an example playbook they can't save to. */
  isPreview: boolean;
  /** True when the playbook is archived. Editing is disabled in this state. */
  isArchived: boolean;
  /** Returns true when the caller must abort (any read-only mode is active). */
  blockIfPreview: (reason?: string) => boolean;
};

const ReadOnlyCtx = createContext<Ctx>({
  isPreview: false,
  isArchived: false,
  blockIfPreview: () => false,
});

export function ExamplePreviewProvider({
  isPreview,
  isArchived = false,
  playbookId,
  canUnarchive = false,
  children,
}: {
  isPreview: boolean;
  isArchived?: boolean;
  playbookId?: string;
  canUnarchive?: boolean;
  children: ReactNode;
}) {
  const [modal, setModal] = useState<{ kind: "example" | "archived"; reason: string } | null>(null);

  const blockIfPreview = useCallback(
    (reason?: string) => {
      if (isArchived) {
        setModal({
          kind: "archived",
          reason:
            reason ??
            "This playbook has been archived and can't be edited. Restore it to make changes.",
        });
        return true;
      }
      if (isPreview) {
        setModal({
          kind: "example",
          reason: reason ?? "This is an example playbook. Changes won't be saved.",
        });
        return true;
      }
      return false;
    },
    [isPreview, isArchived],
  );

  const value = useMemo(
    () => ({ isPreview, isArchived, blockIfPreview }),
    [isPreview, isArchived, blockIfPreview],
  );

  return (
    <ReadOnlyCtx.Provider value={value}>
      {children}
      {modal?.kind === "example" && (
        <ExamplePreviewModal
          reason={modal.reason}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "archived" && (
        <ArchivedPlaybookModal
          reason={modal.reason}
          playbookId={playbookId ?? null}
          canUnarchive={canUnarchive}
          onClose={() => setModal(null)}
        />
      )}
    </ReadOnlyCtx.Provider>
  );
}

export function useExamplePreview(): Ctx {
  return useContext(ReadOnlyCtx);
}

function ExamplePreviewModal({
  reason,
  onClose,
}: {
  reason: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div className="inline-flex items-center gap-2">
            <FlaskConical className="size-4 text-primary" />
            <h2 className="text-base font-bold text-foreground">
              Example playbook
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-5 text-sm text-foreground">
          <p>{reason}</p>
          <p className="text-muted">
            Create your own playbook to save plays, formations, and roster
            changes.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-inset hover:text-foreground"
          >
            Keep exploring
          </button>
          <Link
            href="/home"
            className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            Create your playbook
          </Link>
        </div>
      </div>
    </div>
  );
}

function ArchivedPlaybookModal({
  reason,
  playbookId,
  canUnarchive,
  onClose,
}: {
  reason: string;
  playbookId: string | null;
  canUnarchive: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function unarchive() {
    if (!playbookId) return;
    setError(null);
    startTransition(async () => {
      const res = await archivePlaybookAction(playbookId, false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div className="inline-flex items-center gap-2">
            <Archive className="size-4 text-primary" />
            <h2 className="text-base font-bold text-foreground">
              Playbook archived
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-5 text-sm text-foreground">
          <p>{reason}</p>
          {canUnarchive ? (
            <p className="text-muted">
              Restore this playbook to make changes. It will return to your
              active playbooks list.
            </p>
          ) : (
            <p className="text-muted">
              Ask the playbook owner to restore it if you need to make
              changes.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-inset hover:text-foreground"
          >
            Close
          </button>
          {canUnarchive && playbookId && (
            <button
              type="button"
              onClick={unarchive}
              disabled={pending}
              className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? "Restoring…" : "Restore playbook"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
