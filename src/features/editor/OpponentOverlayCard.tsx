"use client";

import { useMemo, useState, useTransition } from "react";
import { Users, X } from "lucide-react";
import type { PlayDocument } from "@/domain/play/types";
import type { PlaybookPlayNavItem } from "@/domain/print/playbookPrint";
import { getPlayForEditorAction } from "@/app/actions/plays";
import { useToast } from "@/components/ui";

type Props = {
  currentPlayId: string;
  playType: PlayDocument["metadata"]["playType"];
  nav: PlaybookPlayNavItem[];
  opponentDoc: PlayDocument | null;
  onChange: (doc: PlayDocument | null) => void;
};

/**
 * View-only opponent overlay. Picking a play loads its PlayDocument and
 * surfaces it upward for the canvas to render as a ghost. Never mutates
 * or persists into the current play — state is local to this component's
 * lifetime, so navigation resets it.
 */
export function OpponentOverlayCard({
  currentPlayId,
  playType,
  nav,
  opponentDoc,
  onChange,
}: Props) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const eligible = useMemo(() => {
    const want: Array<"offense" | "defense" | "special_teams"> =
      playType === "offense"
        ? ["defense"]
        : playType === "defense"
          ? ["offense"]
          : ["offense", "defense", "special_teams"];
    return nav.filter(
      (p) =>
        p.id !== currentPlayId &&
        p.current_version_id != null &&
        want.includes(p.play_type),
    );
  }, [nav, playType, currentPlayId]);

  const pick = (id: string) => {
    setSelectedId(id);
    if (!id) {
      onChange(null);
      return;
    }
    startTransition(async () => {
      const res = await getPlayForEditorAction(id);
      if (!res.ok) {
        toast(res.error, "error");
        setSelectedId("");
        return;
      }
      onChange(res.document);
    });
  };

  const label =
    playType === "offense"
      ? "View against defense"
      : playType === "defense"
        ? "View against offense"
        : "View against opponent";

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-inset/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Opponent
        </p>
        {opponentDoc && (
          <button
            type="button"
            onClick={() => {
              setSelectedId("");
              onChange(null);
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface-inset hover:text-foreground"
            aria-label="Clear opponent"
            title="Clear"
          >
            <X className="size-3.5" />
            Clear
          </button>
        )}
      </div>

      <label className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted">
        <Users className="size-3.5" />
        {label}
      </label>

      {eligible.length === 0 ? (
        <p className="text-xs text-muted">
          No eligible plays in this playbook yet.
        </p>
      ) : (
        <select
          value={selectedId}
          onChange={(e) => pick(e.target.value)}
          disabled={pending}
          className="w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-60"
        >
          <option value="">None</option>
          {eligible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.formation_name ? ` — ${p.formation_name}` : ""}
            </option>
          ))}
        </select>
      )}

      <p className="text-[11px] leading-snug text-muted">
        Overlay is view-only. It won&apos;t be saved to this play and resets
        when you leave.
      </p>
    </div>
  );
}
