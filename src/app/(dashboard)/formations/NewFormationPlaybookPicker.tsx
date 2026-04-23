"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { listCopyTargetPlaybooksAction } from "@/app/actions/playbooks";
import { Button, useToast } from "@/components/ui";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

type PlaybookRow = {
  id: string;
  name: string;
  sport_variant: string | null;
};

/**
 * Modal that launches the "New formation" flow by picking one or more target
 * playbooks (multi-select). The formation editor creates an independent
 * formation in each selected playbook on save.
 *
 * Variant is inferred from the selection: we force all picks to share the
 * same sport_variant so the editor can initialize a single canvas.
 */
export function NewFormationPlaybookPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  /**
   * Called with the picked playbook IDs (comma-joined via URL later) and the
   * shared sport_variant. For multi-select, the first id is the primary for
   * return navigation.
   */
  onPick: (playbookIdsCsv: string, variant: SportVariant) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState<PlaybookRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listCopyTargetPlaybooksAction();
      if (cancelled) return;
      if (res.ok) {
        setBooks(
          res.playbooks.map((p) => ({
            id: p.id,
            name: p.name,
            sport_variant: p.sport_variant,
          })),
        );
      } else {
        toast(res.error, "error");
        onClose();
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive the active variant from the first pick. Books with a different
  // variant are disabled (shown greyed) to prevent mixed-variant creates.
  const primaryId = Array.from(picked)[0];
  const primaryVariant = primaryId
    ? books.find((b) => b.id === primaryId)?.sport_variant ?? null
    : null;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    if (picked.size === 0) return;
    const ids = Array.from(picked);
    const variant = (books.find((b) => b.id === ids[0])?.sport_variant ??
      "flag_7v7") as SportVariant;
    onPick(ids.join(","), variant);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface-raised shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-semibold text-foreground">New formation in…</h3>
          <p className="text-xs text-muted">
            Pick one or more playbooks. The formation will be created
            independently in each.
          </p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-6 text-center text-xs text-muted">Loading…</p>
          ) : books.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">
              You have no playbooks you can edit.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {books.map((b) => {
                const disabled =
                  primaryVariant !== null &&
                  b.sport_variant !== primaryVariant &&
                  !picked.has(b.id);
                const checked = picked.has(b.id);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(b.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                        disabled
                          ? "cursor-not-allowed opacity-40"
                          : "hover:bg-surface-inset"
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-foreground">
                          {b.name}
                        </span>
                        <span className="truncate text-xs text-muted">
                          {SPORT_VARIANT_LABELS[
                            (b.sport_variant ?? "flag_7v7") as SportVariant
                          ] ?? b.sport_variant}
                        </span>
                      </span>
                      <span
                        className={`flex size-5 items-center justify-center rounded border ${
                          checked
                            ? "border-primary bg-primary text-primary-contrast"
                            : "border-border"
                        }`}
                      >
                        {checked && <Check className="size-3.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <p className="text-xs text-muted">{picked.size} selected</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={confirm}
              disabled={picked.size === 0}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
