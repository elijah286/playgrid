"use client";

import { Check, Pencil, Undo2 } from "lucide-react";

type Props = {
  active: boolean;
  onToggle: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
};

/**
 * Floating pill anchored below the field. Toggles the editor into an explicit
 * "draw route" mode so canvas drags only create strokes when the user opts in
 * — otherwise a stray drag (especially on touch) silently produced a route.
 */
export function DrawRoutePill({ active, onToggle, onUndo, canUndo }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-black/75 p-1 shadow-lg ring-1 ring-white/15 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            try {
              navigator.vibrate?.(active ? 8 : 14);
            } catch {
              /* ignore */
            }
            onToggle();
          }}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
            active
              ? "bg-white text-black"
              : "bg-primary text-white hover:bg-primary-hover"
          }`}
        >
          {active ? (
            <>
              <Check className="size-4" />
              Done
            </>
          ) : (
            <>
              <Pencil className="size-4" />
              Draw route
            </>
          )}
        </button>
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/85 hover:bg-white/10 disabled:opacity-40"
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
