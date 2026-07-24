"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Settings,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { renamePlaybookAction, archivePlaybookAction } from "@/app/actions/playbooks";

/**
 * Playbook-level "download / manage" menu for the Team hub header. Print/Export
 * is available to any member; rename/archive/settings are coach-only. Archive is
 * the soft-delete (there's no permanent-delete here — that stays in production).
 * Reuses the existing print page + server actions (one source of truth).
 */
export function PlaybookActionMenu({
  playbookId,
  playbookName,
  canEdit,
  onColorClassName = "",
}: {
  playbookId: string;
  playbookName: string;
  canEdit: boolean;
  /** Trigger styling so the ••• reads on the colored banner. */
  onColorClassName?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rename = () => {
    setOpen(false);
    const next = window.prompt("Rename playbook", playbookName)?.trim();
    if (!next || next === playbookName) return;
    start(async () => {
      const res = await renamePlaybookAction(playbookId, next);
      if (res.ok) router.refresh();
      else toast(res.error, "error");
    });
  };

  const archive = () => {
    setOpen(false);
    if (!window.confirm(`Archive "${playbookName}"? You can restore it from Playbooks.`)) return;
    start(async () => {
      const res = await archivePlaybookAction(playbookId, true);
      if (res.ok) router.push("/app/playbooks");
      else toast(res.error, "error");
    });
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Playbook actions"
        className={`grid size-9 place-items-center rounded-lg transition-colors ${onColorClassName}`}
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <MoreHorizontal className="size-5" aria-hidden />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-surface-raised py-1 text-foreground shadow-elevated"
        >
          <Link
            href={`/playbooks/${playbookId}/print`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-surface-inset"
          >
            <Download className="size-4 text-muted" aria-hidden />
            Print / Export PDF
          </Link>

          {canEdit && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                role="menuitem"
                onClick={rename}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors hover:bg-surface-inset"
              >
                <Pencil className="size-4 text-muted" aria-hidden />
                Rename
              </button>
              <Link
                href="/app/team/settings"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-surface-inset"
              >
                <Settings className="size-4 text-muted" aria-hidden />
                Settings
              </Link>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                role="menuitem"
                onClick={archive}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-light"
              >
                <Archive className="size-4" aria-hidden />
                Archive
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
