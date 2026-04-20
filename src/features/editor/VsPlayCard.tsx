"use client";

import { useTransition } from "react";
import { Link2Off, RefreshCcw, Swords } from "lucide-react";
import type { VsPlaySnapshot } from "@/domain/play/types";
import {
  resyncDefenseVsPlayAction,
  unlinkDefenseVsPlayAction,
} from "@/app/actions/plays";
import { useToast } from "@/components/ui";

type Props = {
  playId: string;
  snapshot: VsPlaySnapshot;
  onSnapshotReplaced: (snap: VsPlaySnapshot) => void;
  onUnlinked: () => void;
};

/**
 * Replaces the Opponent overlay picker when a defense play is "installed
 * against" a specific offensive play. Shows what we're vs, when the
 * snapshot was taken, and the two write actions: re-sync (pull the offense
 * again) and unlink (turn this back into a generic defense play).
 */
export function VsPlayCard({
  playId,
  snapshot,
  onSnapshotReplaced,
  onUnlinked,
}: Props) {
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const capturedOn = new Date(snapshot.snapshotAt).toLocaleDateString();

  const resync = () => {
    start(async () => {
      const res = await resyncDefenseVsPlayAction(playId);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      if (res.snapshot) {
        onSnapshotReplaced(res.snapshot);
        toast("Resynced against the current offense", "success");
      }
    });
  };

  const unlink = () => {
    start(async () => {
      const res = await unlinkDefenseVsPlayAction(playId);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      onUnlinked();
      toast("Unlinked — back to a generic defense play", "success");
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Swords className="size-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Installed vs
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {snapshot.sourceName}
        </p>
        {snapshot.sourceFormationName && (
          <p className="truncate text-[11px] text-muted">
            {snapshot.sourceFormationName}
          </p>
        )}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
          Snapshot {capturedOn}
        </p>
      </div>

      <div className="flex items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={resync}
          disabled={pending}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] text-foreground hover:bg-surface-inset disabled:opacity-60"
          title="Re-pull the offense's current players and routes"
        >
          <RefreshCcw className="size-3" />
          Re-sync
        </button>
        <button
          type="button"
          onClick={unlink}
          disabled={pending}
          className="inline-flex items-center justify-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] text-muted hover:bg-surface-inset hover:text-foreground disabled:opacity-60"
          title="Unlink from the offensive play"
        >
          <Link2Off className="size-3" />
          Unlink
        </button>
      </div>

      <p className="text-[10px] leading-snug text-muted">
        The offensive routes render alongside your defense and animate
        together. Edits to the offense don&apos;t reflect here until you
        re-sync.
      </p>
    </div>
  );
}
