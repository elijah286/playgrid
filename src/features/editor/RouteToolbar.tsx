"use client";

import {
  Minus,
  Spline,
  Undo2,
  Redo2,
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
import { SegmentedControl, IconButton } from "@/components/ui";
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

type StrokeOpt = { value: StrokePattern; label: string };
const STROKE_OPTIONS_OFFENSE: StrokeOpt[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "motion", label: "Motion" },
];
const STROKE_OPTIONS_DEFENSE: StrokeOpt[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

function StrokeGlyph({ kind }: { kind: StrokePattern }) {
  if (kind === "motion") return <Waves className="size-4" />;
  const dash =
    kind === "solid" ? undefined : kind === "dashed" ? "5 3" : "1.5 3";
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
      <line
        x1="2"
        y1="5"
        x2="18"
        y2="5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={dash}
      />
    </svg>
  );
}

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
  const strokeOptions = isDefense ? STROKE_OPTIONS_DEFENSE : STROKE_OPTIONS_OFFENSE;
  const activeStroke = strokePattern === "motion" && isDefense ? "solid" : strokePattern;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1.5 shadow-sm">
      {/* Row 1: shape / stroke / width / end decoration / color */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <SegmentedControl
          options={SHAPE_OPTIONS}
          value={shape}
          onChange={onShapeChange}
          size="sm"
        />

        <div className="inline-flex items-center rounded-lg bg-surface-inset p-1">
          {strokeOptions.map((opt) => {
            const active = opt.value === activeStroke;
            return (
              <Tooltip key={opt.value} content={opt.label}>
                <button
                  type="button"
                  onClick={() => onStrokePatternChange(opt.value)}
                  aria-label={opt.label}
                  className={`inline-flex h-6 w-8 items-center justify-center rounded-md transition-all ${
                    active
                      ? "bg-surface-raised text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <StrokeGlyph kind={opt.value} />
                </button>
              </Tooltip>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5">
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

        <div className="inline-flex items-center rounded-lg bg-surface-inset p-1">
          {END_OPTIONS.map((opt) => {
            const active = opt.value === endDecoration;
            const Icon = opt.icon;
            return (
              <Tooltip key={opt.value} content={opt.label}>
                <button
                  type="button"
                  onClick={() => onEndDecorationChange(opt.value)}
                  aria-label={opt.label}
                  className={`inline-flex h-6 w-7 items-center justify-center rounded-md transition-all ${
                    active
                      ? "bg-surface-raised text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                </button>
              </Tooltip>
            );
          })}
        </div>

        <div className="flex items-center gap-0.5">
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

      {/* Row 2: history / player actions / zones */}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <Tooltip content="Undo">
          <IconButton icon={Undo2} variant="ghost" size="sm" disabled={!canUndo} onClick={onUndo} />
        </Tooltip>
        <Tooltip content="Redo">
          <IconButton icon={Redo2} variant="ghost" size="sm" disabled={!canRedo} onClick={onRedo} />
        </Tooltip>

        <Tooltip content="Smooth curve">
          <IconButton icon={Sparkles} variant="ghost" size="sm" disabled={!canSmooth} onClick={onSmooth} />
        </Tooltip>

        {onFlipHorizontal && (
          <Tooltip content="Flip horizontal">
            <IconButton icon={FlipHorizontal} variant="ghost" size="sm" onClick={onFlipHorizontal} />
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
              size="sm"
              disabled={totalRouteCount === 0}
              onClick={onClearAllRoutes}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            />
          </Tooltip>
        )}

        {isDefense && onAddRectZone && onAddEllipseZone && (
          <>
            <Tooltip content="Add rectangular zone">
              <IconButton icon={Square} variant="ghost" size="sm" onClick={onAddRectZone} />
            </Tooltip>
            <Tooltip content="Add elliptical zone">
              <IconButton icon={Circle} variant="ghost" size="sm" onClick={onAddEllipseZone} />
            </Tooltip>
          </>
        )}

        {showPlayerActions && (
          <>
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
      </div>
    </div>
  );
}
