import { Pencil } from "lucide-react";
import type { LaneDiagram } from "@/domain/practice-plan/types";

/**
 * Placeholder diagram thumbnail for a lane. In cycle 1 the inline canvas
 * editor isn't wired up yet — this surfaces the shape of the feature without
 * committing to an implementation. When `diagram` is null, a button invites
 * the coach to draw one (no-op for now).
 */
export function EquipmentDiagramPreview({
  diagram,
  onClear,
}: {
  diagram: LaneDiagram | null;
  onClear: () => void;
}) {
  if (!diagram) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted"
        title="Inline drill diagrams ship in the next cycle"
      >
        <Pencil className="h-3 w-3" />
        Drill diagram (coming soon)
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
      <span className="text-muted">Diagram attached</span>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md px-2 py-0.5 text-muted hover:bg-destructive/10 hover:text-destructive"
      >
        Remove
      </button>
    </div>
  );
}
