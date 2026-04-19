"use client";

import {
  Minus,
  Spline,
  Undo2,
  Redo2,
  Check,
  Sparkles,
  Waves,
  ArrowRight,
  Ban,
  Star,
  Trash2,
} from "lucide-react";
import type { EndDecoration, SegmentShape, StrokePattern } from "@/domain/play/types";
import { SegmentedControl, IconButton, Button } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";

type Props = {
  shape: SegmentShape;
  onShapeChange: (s: SegmentShape) => void;
  strokePattern: StrokePattern;
  onStrokePatternChange: (p: StrokePattern) => void;
  color: string;
  onColorChange: (c: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
  canSmooth: boolean;
  onSmooth: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  onDone: () => void;
  doneLabel?: string;
  /** End-of-route decoration (arrow/T/none). Disabled when no route selected. */
  endDecoration: EndDecoration;
  onEndDecorationChange: (d: EndDecoration) => void;
  /** Player-level controls — shown when a player is selected. */
  hasSelectedPlayer?: boolean;
  isHotRoute?: boolean;
  onToggleHotRoute?: () => void;
  playerRouteCount?: number;
  onClearPlayerRoutes?: () => void;
};

const SHAPE_OPTIONS: { value: SegmentShape; label: string; icon: typeof Minus }[] = [
  { value: "straight", label: "Straight", icon: Minus },
  { value: "curve", label: "Curve", icon: Spline },
];

const STROKE_OPTIONS: { value: StrokePattern; label: string; icon?: typeof Waves }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "motion", label: "Motion", icon: Waves },
];

const END_OPTIONS: { value: EndDecoration; label: string; icon: typeof ArrowRight }[] = [
  { value: "arrow", label: "Arrow", icon: ArrowRight },
  { value: "t", label: "T", icon: Minus },
  { value: "none", label: "None", icon: Ban },
];

const COLOR_PRESETS = [
  "#FFFFFF",
  "#F26522",
  "#3B82F6",
  "#EF4444",
  "#FACC15",
  "#22C55E",
];

const WIDTH_OPTIONS: { value: number; label: string; px: number }[] = [
  { value: 1.5, label: "Thin", px: 1 },
  { value: 2.5, label: "Med", px: 2 },
  { value: 4.0, label: "Thick", px: 3 },
];

export function RouteToolbar({
  shape,
  onShapeChange,
  strokePattern,
  onStrokePatternChange,
  color,
  onColorChange,
  width,
  onWidthChange,
  canSmooth,
  onSmooth,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onDone,
  doneLabel = "Done",
  endDecoration,
  onEndDecorationChange,
  hasSelectedPlayer = false,
  isHotRoute = false,
  onToggleHotRoute,
  playerRouteCount = 0,
  onClearPlayerRoutes,
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

      {/* Line width */}
      <div className="flex items-center gap-1">
        {WIDTH_OPTIONS.map((w) => {
          const active = w.value === width;
          return (
            <button
              key={w.value}
              type="button"
              onClick={() => onWidthChange(w.value)}
              title={w.label}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                active
                  ? "bg-surface-inset text-foreground shadow-sm"
                  : "text-muted hover:bg-surface-inset/50 hover:text-foreground"
              }`}
            >
              <div
                className="rounded-full bg-current"
                style={{ width: 14, height: w.px }}
              />
            </button>
          );
        })}
      </div>

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

      {/* End-of-route decoration */}
      <SegmentedControl
        options={END_OPTIONS}
        value={endDecoration}
        onChange={onEndDecorationChange}
        size="sm"
      />

      <div className="h-5 w-px bg-border" />

      <Tooltip content="Smooth curve">
        <IconButton
          icon={Sparkles}
          variant="ghost"
          disabled={!canSmooth}
          onClick={onSmooth}
        />
      </Tooltip>

      <Tooltip content="Undo">
        <IconButton
          icon={Undo2}
          variant="ghost"
          disabled={!canUndo}
          onClick={onUndo}
        />
      </Tooltip>

      <Tooltip content="Redo">
        <IconButton
          icon={Redo2}
          variant="ghost"
          disabled={!canRedo}
          onClick={onRedo}
        />
      </Tooltip>

      {hasSelectedPlayer && (
        <>
          <div className="h-5 w-px bg-border" />
          <Tooltip content={isHotRoute ? "Remove hot route" : "Mark as hot route"}>
            <IconButton
              icon={Star}
              variant="ghost"
              size="sm"
              onClick={onToggleHotRoute}
              className={isHotRoute ? "text-amber-400 hover:text-amber-300" : undefined}
              aria-pressed={isHotRoute}
            />
          </Tooltip>
          <Tooltip content={playerRouteCount > 0 ? `Clear ${playerRouteCount} route${playerRouteCount !== 1 ? "s" : ""}` : "No routes to clear"}>
            <IconButton
              icon={Trash2}
              variant="ghost"
              size="sm"
              disabled={playerRouteCount === 0}
              onClick={onClearPlayerRoutes}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            />
          </Tooltip>
        </>
      )}

      <div className="ml-auto" />

      <Button variant="primary" size="sm" leftIcon={Check} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
