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
  FlipHorizontal,
  Star,
  Trash2,
  Square,
  Circle,
  Eraser,
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
  onFlipHorizontal?: () => void;
  /** Defensive plays hide motion stroke and show zone-add buttons instead. */
  isDefense?: boolean;
  onAddRectZone?: () => void;
  onAddEllipseZone?: () => void;
  /** Clear every route in the play. Disabled when there are none. */
  totalRouteCount?: number;
  onClearAllRoutes?: () => void;
};

const SHAPE_OPTIONS: { value: SegmentShape; label: string; icon: typeof Minus }[] = [
  { value: "straight", label: "Straight", icon: Minus },
  { value: "curve", label: "Curve", icon: Spline },
];

const STROKE_OPTIONS_OFFENSE: { value: StrokePattern; label: string; icon?: typeof Waves }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "motion", label: "Motion", icon: Waves },
];
const STROKE_OPTIONS_DEFENSE: { value: StrokePattern; label: string; icon?: typeof Waves }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const END_OPTIONS: { value: EndDecoration; label: string; icon: typeof ArrowRight }[] = [
  { value: "arrow", label: "Arrow", icon: ArrowRight },
  { value: "t", label: "T", icon: Minus },
  { value: "none", label: "None", icon: Ban },
];

const COLOR_PRESETS = [
  "#FFFFFF",
  "#000000",
  "#F26522",
  "#3B82F6",
  "#EF4444",
  "#FACC15",
  "#22C55E",
  "#A855F7",
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
  onFlipHorizontal,
  isDefense = false,
  onAddRectZone,
  onAddEllipseZone,
  totalRouteCount = 0,
  onClearAllRoutes,
}: Props) {
  const showPlayerActions = !isDefense;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-sm">
      {/* Row 1: shape / stroke / width / color (top-right) */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SegmentedControl
          options={SHAPE_OPTIONS}
          value={shape}
          onChange={onShapeChange}
          size="sm"
        />

        <div className="h-5 w-px bg-border" />

        <SegmentedControl
          options={isDefense ? STROKE_OPTIONS_DEFENSE : STROKE_OPTIONS_OFFENSE}
          value={strokePattern === "motion" && isDefense ? "solid" : strokePattern}
          onChange={onStrokePatternChange}
          size="sm"
        />

        {isDefense && onAddRectZone && onAddEllipseZone && (
          <>
            <div className="h-5 w-px bg-border" />
            <Tooltip content="Add rectangular zone">
              <IconButton icon={Square} variant="ghost" size="sm" onClick={onAddRectZone} />
            </Tooltip>
            <Tooltip content="Add elliptical zone">
              <IconButton icon={Circle} variant="ghost" size="sm" onClick={onAddEllipseZone} />
            </Tooltip>
          </>
        )}

        <div className="h-5 w-px bg-border" />

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

        <div className="flex items-center gap-0.5 sm:ml-auto">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              className={`size-4 rounded-full border-2 transition-transform ${
                c === color ? "scale-110 border-primary" : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Row 2: end decoration / history / player actions / done */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
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

        {onFlipHorizontal && (
          <Tooltip content="Flip horizontal">
            <IconButton
              icon={FlipHorizontal}
              variant="ghost"
              onClick={onFlipHorizontal}
            />
          </Tooltip>
        )}

        {onClearAllRoutes && (
          <Tooltip
            content={
              totalRouteCount > 0
                ? `Clear all ${totalRouteCount} route${totalRouteCount !== 1 ? "s" : ""}`
                : "No routes to clear"
            }
          >
            <IconButton
              icon={Eraser}
              variant="ghost"
              disabled={totalRouteCount === 0}
              onClick={onClearAllRoutes}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            />
          </Tooltip>
        )}

        {showPlayerActions && (
          <>
            <div className="h-5 w-px bg-border" />
            <Tooltip content={hasSelectedPlayer ? (isHotRoute ? "Remove hot route" : "Mark as hot route") : "Select a player to toggle hot route"}>
              <IconButton
                icon={Star}
                variant="ghost"
                size="sm"
                disabled={!hasSelectedPlayer}
                onClick={onToggleHotRoute}
                className={hasSelectedPlayer && isHotRoute ? "text-amber-400 hover:text-amber-300" : undefined}
                aria-pressed={isHotRoute}
              />
            </Tooltip>
            <Tooltip
              content={
                !hasSelectedPlayer
                  ? "Select a player to clear their routes"
                  : playerRouteCount > 0
                    ? `Clear ${playerRouteCount} route${playerRouteCount !== 1 ? "s" : ""}`
                    : "No routes to clear"
              }
            >
              <IconButton
                icon={Trash2}
                variant="ghost"
                size="sm"
                disabled={!hasSelectedPlayer || playerRouteCount === 0}
                onClick={onClearPlayerRoutes}
                className="text-danger hover:bg-danger/10 hover:text-danger"
              />
            </Tooltip>
          </>
        )}

        <div className="hidden sm:ml-auto sm:block" />

        <Button variant="primary" size="sm" leftIcon={Check} onClick={onDone}>
          {doneLabel}
        </Button>
      </div>
    </div>
  );
}
