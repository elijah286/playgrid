"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Check,
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
  /** Whether a route is currently selected — gates the end-decoration row. */
  hasSelectedRoute?: boolean;
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
  /** Render a "Done" button on the right side of the toolbar. Click clears
   *  the current selection; disabled when nothing is selected. Only shown on
   *  pointer-and-keyboard devices — touch devices use the bigger Edit/Done
   *  toggle that lives above the field. */
  showDoneButton?: boolean;
  hasAnySelection?: boolean;
  onDone?: () => void;
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
  hasSelectedRoute = false,
  hasSelectedPlayer = false,
  isHotRoute = false,
  onToggleHotRoute,
  playerRouteCount = 0,
  onClearPlayerRoutes,
  onFlipHorizontal,
  isDefense = false,
  onAddRectZone,
  onAddEllipseZone,
  showDoneButton = false,
  hasAnySelection = false,
  onDone,
}: Props) {
  // Hot-route is offense-specific (audible signal). Clearing the player's
  // path is meaningful for both — it just means "wipe the routes I drew on
  // this offensive player" or "wipe the movement I drew on this defender."
  const showHotRoute = !isDefense;
  const showClearPath = true;
  const clearLabel = isDefense ? "movement" : "route";
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

        <div
          className={`inline-flex items-center rounded-lg bg-surface-inset p-1 ${
            hasSelectedRoute ? "" : "opacity-40"
          }`}
        >
          {END_OPTIONS.map((opt) => {
            const active = hasSelectedRoute && opt.value === endDecoration;
            const Icon = opt.icon;
            return (
              <Tooltip
                key={opt.value}
                content={hasSelectedRoute ? opt.label : `Select a ${clearLabel} first`}
              >
                <button
                  type="button"
                  onClick={() => onEndDecorationChange(opt.value)}
                  disabled={!hasSelectedRoute}
                  aria-label={opt.label}
                  className={`inline-flex h-6 w-7 items-center justify-center rounded-md transition-all ${
                    active
                      ? "bg-surface-raised text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:hover:text-muted`}
                >
                  <Icon className="size-3.5" />
                </button>
              </Tooltip>
            );
          })}
        </div>

        <ColorPickerButton color={color} onColorChange={onColorChange} />
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

        {showHotRoute && (
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
        )}
        {showClearPath && (
          <Tooltip
            content={
              !hasSelectedPlayer
                ? `Select a player to clear their ${clearLabel}s`
                : playerRouteCount > 0
                  ? `Clear ${playerRouteCount} ${clearLabel}${playerRouteCount !== 1 ? "s" : ""}`
                  : `No ${clearLabel}s to clear`
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
        )}

        {showDoneButton && onDone && (
          <Tooltip
            content={
              hasAnySelection
                ? "Done — deselect (Esc)"
                : "Nothing selected"
            }
          >
            <span className="ml-auto inline-flex">
              <button
                type="button"
                disabled={!hasAnySelection}
                onClick={onDone}
                aria-label="Done editing current selection"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface-inset px-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-raised disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface-inset"
              >
                <Check className="size-3.5" />
                Done
              </button>
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Compact color trigger that opens a popover with the preset swatches.
 *  Uses the standard "palette" icon so it's recognizable at a glance,
 *  with a thin colored underline showing the current pick. The popover
 *  renders into a portal so it never clips against the toolbar/card it
 *  lives inside. */
function ColorPickerButton({
  color,
  onColorChange,
}: {
  color: string;
  onColorChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Reposition under the trigger when opening or on resize/scroll.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const t = triggerRef.current;
      const p = popRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const pw = p?.offsetWidth ?? 168; // matches min-w below
      const ph = p?.offsetHeight ?? 60;
      const pad = 6;
      // Default: align to the right edge of the trigger, just below.
      let left = r.right - pw;
      const top = r.bottom + 4;
      // Clamp to viewport.
      left = Math.max(pad, Math.min(left, window.innerWidth - pw - pad));
      const finalTop = Math.min(top, window.innerHeight - ph - pad);
      setPos({ left, top: finalTop });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const popover = open && pos ? (
    <div
      ref={popRef}
      role="menu"
      // Tagged so the editor's outside-click deselect handler knows to
      // ignore clicks landing in this portaled popover — without this, the
      // act of picking a color triggers the deselect (since the popover is
      // portaled outside the editor root) and the in-flight selection
      // (offense player or opponent defender) is wiped before the color
      // change is reflected on screen.
      data-editor-overlay="color-picker"
      style={{ position: "fixed", left: pos.left, top: pos.top, minWidth: "10.5rem" }}
      className="z-50 flex flex-wrap gap-1 rounded-md border border-border bg-surface-raised p-1.5 shadow-lg"
    >
      {COLOR_PRESETS.map((c) => {
        const active = c === color;
        return (
          <button
            key={c}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => {
              onColorChange(c);
              setOpen(false);
            }}
            className={`size-6 rounded-full border-2 transition-transform ${
              active
                ? "scale-110 border-primary"
                : "border-transparent hover:scale-105 hover:border-foreground/20"
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <Tooltip content="Color">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Pick color"
          className={`relative flex size-7 items-center justify-center rounded-md border transition-colors ${
            open
              ? "border-primary bg-primary/10"
              : "border-border bg-surface-inset hover:bg-surface-raised"
          }`}
        >
          {/* Custom palette glyph: outline in foreground color, dots
              filled in saturated hues so the affordance reads as a
              color picker at a glance (instead of a flat gray icon). */}
          <svg
            viewBox="0 0 24 24"
            className="size-4 text-foreground"
            aria-hidden="true"
          >
            <path
              d="M12 2C6.477 2 2 6.477 2 12c0 5.523 4.477 10 10 10 .995 0 1.8-.805 1.8-1.8 0-.46-.182-.876-.474-1.18a1.797 1.797 0 0 1-.474-1.222c0-.995.805-1.798 1.8-1.798h2.117c3.183 0 5.768-2.585 5.768-5.768C22.537 5.683 17.834 2 12 2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="6.5" cy="12.5" r="1.3" fill="#22C55E" />
            <circle cx="8.5" cy="7.5" r="1.3" fill="#FACC15" />
            <circle cx="13.5" cy="6.5" r="1.3" fill="#EF4444" />
            <circle cx="17.5" cy="10.5" r="1.3" fill="#3B82F6" />
          </svg>
          <span
            aria-hidden
            className="absolute inset-x-1 bottom-0.5 h-1 rounded-sm border border-black/15"
            style={{ backgroundColor: color }}
          />
        </button>
      </Tooltip>
      {typeof document !== "undefined" && popover
        ? createPortal(popover, document.body)
        : null}
    </>
  );
}
