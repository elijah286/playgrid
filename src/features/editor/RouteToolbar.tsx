"use client";

import {
  Minus,
  Spline,
  ZapOff,
  Undo2,
  Check,
  Sparkles,
} from "lucide-react";
import type { PlayCommand } from "@/domain/play/commands";
import type { SegmentShape, StrokePattern } from "@/domain/play/types";
import { SegmentedControl, IconButton, Button } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";

type Props = {
  /** Currently active/selected shape */
  shape: SegmentShape;
  onShapeChange: (s: SegmentShape) => void;
  /** Currently active/selected stroke pattern */
  strokePattern: StrokePattern;
  onStrokePatternChange: (p: StrokePattern) => void;
  /** Currently active color */
  color: string;
  onColorChange: (c: string) => void;
  /** Is a segment with a manual control offset selected? */
  canSmooth: boolean;
  onSmooth: () => void;
  /** Undo callback */
  onUndo: () => void;
  canUndo: boolean;
  /** Done / finish placing */
  onDone: () => void;
  /** Label for the done button */
  doneLabel?: string;
};

const SHAPE_OPTIONS: { value: SegmentShape; label: string; icon: typeof Minus }[] = [
  { value: "straight", label: "Straight", icon: Minus },
  { value: "curve", label: "Curve", icon: Spline },
  { value: "zigzag", label: "Zigzag", icon: ZapOff },
];

const STROKE_OPTIONS: { value: StrokePattern; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const COLOR_PRESETS = [
  "#FFFFFF",
  "#F26522",
  "#3B82F6",
  "#EF4444",
  "#FACC15",
  "#22C55E",
];

export function RouteToolbar({
  shape,
  onShapeChange,
  strokePattern,
  onStrokePatternChange,
  color,
  onColorChange,
  canSmooth,
  onSmooth,
  onUndo,
  canUndo,
  onDone,
  doneLabel = "Done",
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-sm">
      {/* Line shape */}
      <SegmentedControl
        options={SHAPE_OPTIONS}
        value={shape}
        onChange={onShapeChange}
        size="sm"
      />

      <div className="h-5 w-px bg-border" />

      {/* Stroke pattern */}
      <SegmentedControl
        options={STROKE_OPTIONS}
        value={strokePattern}
        onChange={onStrokePatternChange}
        size="sm"
      />

      <div className="h-5 w-px bg-border" />

      {/* Color swatches */}
      <div className="flex items-center gap-1">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            className={`size-5 rounded-full border-2 transition-transform ${
              c === color ? "scale-110 border-primary" : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Smooth button */}
      <Tooltip content="Smooth curve">
        <IconButton
          icon={Sparkles}
          variant="ghost"
          disabled={!canSmooth}
          onClick={onSmooth}
        />
      </Tooltip>

      {/* Undo */}
      <Tooltip content="Undo">
        <IconButton
          icon={Undo2}
          variant="ghost"
          disabled={!canUndo}
          onClick={onUndo}
        />
      </Tooltip>

      <div className="ml-auto" />

      {/* Done */}
      <Button variant="primary" size="sm" leftIcon={Check} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
