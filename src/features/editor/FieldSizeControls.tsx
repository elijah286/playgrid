"use client";

import type { PlayCommand } from "@/domain/play/commands";
import type { PlayDocument } from "@/domain/play/types";
import {
  resolveBackfieldYards,
  resolveDownfieldYards,
  resolveFieldZone,
  resolveLineOfScrimmage,
  resolveShowHashMarks,
} from "@/domain/play/factory";
import { SegmentedControl } from "@/components/ui";

type Props = {
  doc: PlayDocument;
  dispatch: (c: PlayCommand) => void;
};

/** Small +/- spinner for an integer yard value. */
function YardSpinner({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex size-5 items-center justify-center rounded border border-border bg-surface-inset text-xs text-muted hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        −
      </button>
      <span className="w-6 text-center text-xs font-medium tabular-nums text-foreground">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex size-5 items-center justify-center rounded border border-border bg-surface-inset text-xs text-muted hover:bg-surface-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

export function FieldSizeControls({ doc, dispatch }: Props) {
  const backfield = resolveBackfieldYards(doc);
  const downfield = resolveDownfieldYards(doc);

  const handleYards = (bk: number, dn: number) => {
    dispatch({ type: "field.setYardage", backfieldYards: bk, downfieldYards: dn });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
      {/* Yard window spinners */}
      <YardSpinner
        label="Bkf"
        value={backfield}
        min={2}
        max={30}
        onChange={(v) => handleYards(v, downfield)}
      />
      <YardSpinner
        label="Dwn"
        value={downfield}
        min={5}
        max={50}
        onChange={(v) => handleYards(backfield, v)}
      />

      <div className="h-4 w-px bg-border" />

      {/* Hash marks */}
      <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          className="size-3.5 cursor-pointer accent-primary"
          checked={resolveShowHashMarks(doc)}
          onChange={(e) =>
            dispatch({
              type: "document.setShowHashMarks",
              showHashMarks: e.target.checked,
            })
          }
        />
        <span>Hashes</span>
      </label>

      {/* LOS style */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted">LOS</span>
        <SegmentedControl
          size="sm"
          options={[
            { value: "line" as const, label: "Line" },
            { value: "football" as const, label: "Ball" },
            { value: "none" as const, label: "None" },
          ]}
          value={resolveLineOfScrimmage(doc)}
          onChange={(v) =>
            dispatch({ type: "document.setLineOfScrimmage", lineOfScrimmage: v })
          }
        />
      </div>

      {/* Field zone */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted">Zone</span>
        <SegmentedControl
          size="sm"
          options={[
            { value: "midfield" as const, label: "Mid" },
            { value: "red_zone" as const, label: "Red" },
          ]}
          value={resolveFieldZone(doc)}
          onChange={(v) =>
            dispatch({ type: "document.setFieldZone", fieldZone: v })
          }
        />
      </div>
    </div>
  );
}
