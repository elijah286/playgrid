"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { FlaskConical, X } from "lucide-react";

/**
 * Shared state for "example preview" mode. When a visitor is viewing a
 * published example playbook they aren't a member of, the whole detail
 * page runs under this provider. Any component that wants to attempt a
 * mutation (save play, create play, add formation, etc.) calls
 * `blockIfPreview` — if we're in preview mode it pops the CTA modal and
 * returns `true` (meaning "don't proceed"); otherwise it returns `false`
 * and the caller can run its real side effect.
 */

type Ctx = {
  isPreview: boolean;
  /** Returns true when the caller must abort (preview mode is active). */
  blockIfPreview: (reason?: string) => boolean;
};

const ExamplePreviewCtx = createContext<Ctx>({
  isPreview: false,
  blockIfPreview: () => false,
});

export function ExamplePreviewProvider({
  isPreview,
  children,
}: {
  isPreview: boolean;
  children: ReactNode;
}) {
  const [modalReason, setModalReason] = useState<string | null>(null);

  const blockIfPreview = useCallback(
    (reason?: string) => {
      if (!isPreview) return false;
      setModalReason(
        reason ??
          "This is an example playbook. Changes won't be saved.",
      );
      return true;
    },
    [isPreview],
  );

  const value = useMemo(
    () => ({ isPreview, blockIfPreview }),
    [isPreview, blockIfPreview],
  );

  return (
    <ExamplePreviewCtx.Provider value={value}>
      {children}
      {modalReason && (
        <ExamplePreviewModal
          reason={modalReason}
          onClose={() => setModalReason(null)}
        />
      )}
    </ExamplePreviewCtx.Provider>
  );
}

export function useExamplePreview(): Ctx {
  return useContext(ExamplePreviewCtx);
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
