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
  Triangle,
  Trash2,
  Square,
  Circle,
  Check,
  ChevronDown,
} from "lucide-react";
import type {
  EndDecoration,
  PlayerShape,
  SegmentShape,
  StrokePattern,
} from "@/domain/play/types";
import { IconButton } from "@/components/ui";
import { notifyTutorialAction } from "@/features/tutorials/engine/notify";
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
  /** Current player's shape; drives the shape popover's active option.
   *  Leave undefined to disable the popover (e.g. opponent overlay
   *  defender — no setter wired). */
  playerShape?: PlayerShape;
  onPlayerShapeChange?: (shape: PlayerShape) => void;
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

const SEGMENT_SHAPE_OPTIONS: {
  value: SegmentShape;
  label: string;
  icon: typeof Minus;
}[] = [
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

type PlayerShapeOption = {
  value: PlayerShape;
  label: string;
  icon: typeof Circle;
};
const PLAYER_SHAPE_OFFENSE: PlayerShapeOption[] = [
  { value: "circle", label: "Circle", icon: Circle },
  { value: "square", label: "Square", icon: Square },
  { value: "star", label: "Hot route", icon: Star },
];
const PLAYER_SHAPE_DEFENSE: PlayerShapeOption[] = [
  { value: "triangle", label: "Triangle", icon: Triangle },
  { value: "circle", label: "Circle", icon: Circle },
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
  playerShape,
  onPlayerShapeChange,
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
  const clearLabel = isDefense ? "movement" : "route";
  const strokeOptions = isDefense ? STROKE_OPTIONS_DEFENSE : STROKE_OPTIONS_OFFENSE;
  const activeStroke = strokePattern === "motion" && isDefense ? "solid" : strokePattern;
  const shapeOptions = isDefense ? PLAYER_SHAPE_DEFENSE : PLAYER_SHAPE_OFFENSE;
  const canEditShape = onPlayerShapeChange != null && playerShape != null;

  return (
    // Mobile: single flex-wrap stream so row-2 items can flow into trailing
    // space of row 1 (e.g. undo lands right after the color picker). Desktop
    // (sm+): the original two-row column layout is preserved via `sm:flex-col`
    // on this container plus `sm:flex` on the inner row wrappers (which use
    // `display: contents` on mobile so their children become direct siblings).
    <div data-tutor="route-toolbar" className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1.5 shadow-sm sm:flex-col sm:flex-nowrap sm:items-stretch">
      {/* Row 1: segment shape / stroke / width / end decoration / color */}
      <div className="contents sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-1.5">
        <div data-tutor="route-toolbar-shape" className="inline-flex items-center rounded-lg bg-surface-inset p-1">
          {SEGMENT_SHAPE_OPTIONS.map((opt) => {
            const active = opt.value === shape;
            const Icon = opt.icon;
            return (
              <Tooltip key={opt.value} content={opt.label}>
                <button
                  type="button"
                  onClick={() => {
                    onShapeChange(opt.value);
                    notifyTutorialAction("route-shape-changed");
                  }}
                  aria-label={opt.label}
                  aria-pressed={active}
                  className={`inline-flex h-6 w-8 items-center justify-center rounded-md transition-all ${
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

        <div data-tutor="route-toolbar-stroke" className="hidden items-center rounded-lg bg-surface-inset p-1 sm:inline-flex">
          {strokeOptions.map((opt) => {
            const active = opt.value === activeStroke;
            return (
              <Tooltip key={opt.value} content={opt.label}>
                <button
                  type="button"
                  onClick={() => {
                    onStrokePatternChange(opt.value);
                    notifyTutorialAction("route-stroke-changed");
                  }}
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

        <div data-tutor="route-toolbar-width" className="hidden items-center rounded-lg bg-surface-inset p-1 sm:inline-flex">
          {WIDTH_OPTIONS.map((w) => {
            const active = w.value === width;
            return (
              <Tooltip key={w.value} content={w.label}>
                <button
                  type="button"
                  onClick={() => {
                    onWidthChange(w.value);
                    notifyTutorialAction("route-width-changed");
                  }}
                  aria-label={w.label}
                  aria-pressed={active}
                  className={`inline-flex h-6 w-7 items-center justify-center rounded-md transition-all ${
                    active
                      ? "bg-surface-raised text-foreground shadow-sm ring-1 ring-inset ring-primary/40"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <div
                    className="rounded-full bg-current"
                    style={{ width: 14, height: w.px }}
                  />
                </button>
              </Tooltip>
            );
          })}
        </div>

        <div
          data-tutor="route-toolbar-end"
          className={`hidden items-center rounded-lg bg-surface-inset p-1 sm:inline-flex ${
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
                  onClick={() => {
                    onEndDecorationChange(opt.value);
                    notifyTutorialAction("route-end-changed");
                  }}
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

        {/* Mobile-only: stroke + width + end-decoration collapse into one
            popover to save horizontal space. Desktop shows the inline groups
            above instead. */}
        <span data-tutor="route-toolbar-line-styles" className="inline-flex sm:hidden">
          <LineStylesPopover
            strokeOptions={strokeOptions}
            activeStroke={activeStroke}
            onStrokePatternChange={onStrokePatternChange}
            width={width}
            onWidthChange={onWidthChange}
            endDecoration={endDecoration}
            onEndDecorationChange={onEndDecorationChange}
            hasSelectedRoute={hasSelectedRoute}
            clearLabel={clearLabel}
          />
        </span>

        <span data-tutor="route-toolbar-color" className="inline-flex">
          <ColorPickerButton color={color} onColorChange={onColorChange} />
        </span>
      </div>

      {/* Row 2: history / player actions / zones / Done */}
      <div className="contents sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-1">
        <span data-tutor="route-toolbar-undo" className="inline-flex items-center gap-1">
          <Tooltip content="Undo">
            <IconButton
              icon={Undo2}
              variant="ghost"
              size="sm"
              disabled={!canUndo}
              onClick={() => {
                onUndo();
                notifyTutorialAction("route-undo-redo");
              }}
            />
          </Tooltip>
          <Tooltip content="Redo">
            <IconButton
              icon={Redo2}
              variant="ghost"
              size="sm"
              disabled={!canRedo}
              onClick={() => {
                onRedo();
                notifyTutorialAction("route-undo-redo");
              }}
            />
          </Tooltip>
        </span>

        <Tooltip content="Smooth curve">
          <IconButton icon={Sparkles} variant="ghost" size="sm" disabled={!canSmooth} onClick={onSmooth} />
        </Tooltip>

        {onFlipHorizontal && (
          <Tooltip content="Flip horizontal">
            <IconButton icon={FlipHorizontal} variant="ghost" size="sm" onClick={onFlipHorizontal} />
          </Tooltip>
        )}

        <ShapePopoverButton
          options={shapeOptions}
          value={playerShape}
          disabled={!canEditShape}
          isDefense={isDefense}
          onChange={(v) => onPlayerShapeChange?.(v)}
        />

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
                data-tutor="editor-done"
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

/** Shared portaled-popover scaffold. */
function usePortalPopover(open: boolean, popMinWidth = 168) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const t = triggerRef.current;
      const p = popRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const pw = p?.offsetWidth ?? popMinWidth;
      const ph = p?.offsetHeight ?? 60;
      const pad = 6;
      let left = r.right - pw;
      const top = r.bottom + 4;
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
  }, [open, popMinWidth]);

  return { triggerRef, popRef, pos };
}

/** Compact color trigger that opens a popover with the preset swatches.
 *  Trigger shows the current color as a filled swatch with a chevron caret,
 *  matching the Figma/Docs/Notion pattern so the active pick reads at a
 *  glance. The popover renders into a portal so it never clips against the
 *  toolbar/card it lives inside. */
function ColorPickerButton({
  color,
  onColorChange,
}: {
  color: string;
  onColorChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, popRef, pos } = usePortalPopover(open);

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
  }, [open, triggerRef, popRef]);

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
      // The tutorial's click-blocker walks `closest()` from the click
      // target looking for a spotlit / allowed ancestor. Because this
      // popover is portaled to body — outside the route-toolbar's
      // subtree — that walk would miss without an explicit allow tag.
      data-tutor-allow=""
      style={{ position: "fixed", left: pos.left, top: pos.top, minWidth: "10.5rem" }}
      // z-[57] (not z-50) so the popover renders above any tutorial
      // spotlit element (z:56) when the tour highlights this toolbar.
      // Still below the tutorial card (z:60). Outside tutorial mode
      // the bump is a no-op since nothing else competes at 51-56.
      className="z-[57] flex flex-wrap gap-1 rounded-md border border-border bg-surface-raised p-1.5 shadow-lg"
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
          className={`inline-flex h-7 items-center gap-1 rounded-md border bg-surface-inset px-1.5 transition-colors hover:bg-surface-raised ${
            open ? "border-primary" : "border-border"
          }`}
        >
          <span
            aria-hidden
            className="block size-4 rounded-full border border-black/15"
            style={{ backgroundColor: color }}
          />
          <ChevronDown className="size-3 text-muted" />
        </button>
      </Tooltip>
      {typeof document !== "undefined" && popover
        ? createPortal(popover, document.body)
        : null}
    </>
  );
}

/** Mobile-only consolidated dropdown for stroke pattern, line width, and
 *  end decoration. Desktop renders these as inline button groups in the
 *  toolbar; on narrow screens the inline groups eat too much horizontal space
 *  and force a third toolbar row, so we collapse them behind one trigger.
 *  Trigger glyph reflects the current stroke pattern at a glance. */
function LineStylesPopover({
  strokeOptions,
  activeStroke,
  onStrokePatternChange,
  width,
  onWidthChange,
  endDecoration,
  onEndDecorationChange,
  hasSelectedRoute,
  clearLabel,
}: {
  strokeOptions: StrokeOpt[];
  activeStroke: StrokePattern;
  onStrokePatternChange: (p: StrokePattern) => void;
  width: number;
  onWidthChange: (w: number) => void;
  endDecoration: EndDecoration;
  onEndDecorationChange: (d: EndDecoration) => void;
  hasSelectedRoute: boolean;
  clearLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, popRef, pos } = usePortalPopover(open, 224);

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
  }, [open, triggerRef, popRef]);

  const popover = open && pos ? (
    <div
      ref={popRef}
      role="menu"
      data-editor-overlay="line-styles"
      data-tutor-allow=""
      style={{ position: "fixed", left: pos.left, top: pos.top, minWidth: "14rem" }}
      className="z-[57] flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-2 shadow-lg"
    >
      <div>
        <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted">Stroke</div>
        <div className="inline-flex items-center rounded-lg bg-surface-inset p-1">
          {strokeOptions.map((opt) => {
            const active = opt.value === activeStroke;
            return (
              <Tooltip key={opt.value} content={opt.label}>
                <button
                  type="button"
                  onClick={() => {
                    onStrokePatternChange(opt.value);
                    notifyTutorialAction("route-stroke-changed");
                  }}
                  aria-label={opt.label}
                  aria-pressed={active}
                  className={`inline-flex h-8 w-10 items-center justify-center rounded-md transition-all ${
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
      </div>

      <div>
        <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted">Width</div>
        <div className="inline-flex items-center rounded-lg bg-surface-inset p-1">
          {WIDTH_OPTIONS.map((w) => {
            const active = w.value === width;
            return (
              <Tooltip key={w.value} content={w.label}>
                <button
                  type="button"
                  onClick={() => {
                    onWidthChange(w.value);
                    notifyTutorialAction("route-width-changed");
                  }}
                  aria-label={w.label}
                  aria-pressed={active}
                  className={`inline-flex h-8 w-9 items-center justify-center rounded-md transition-all ${
                    active
                      ? "bg-surface-raised text-foreground shadow-sm ring-1 ring-inset ring-primary/40"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <div
                    className="rounded-full bg-current"
                    style={{ width: 16, height: w.px }}
                  />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted">End</div>
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
                  onClick={() => {
                    onEndDecorationChange(opt.value);
                    notifyTutorialAction("route-end-changed");
                  }}
                  disabled={!hasSelectedRoute}
                  aria-label={opt.label}
                  aria-pressed={active}
                  className={`inline-flex h-8 w-9 items-center justify-center rounded-md transition-all ${
                    active
                      ? "bg-surface-raised text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:hover:text-muted`}
                >
                  <Icon className="size-4" />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Tooltip content="Line styles">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Line styles"
          className={`inline-flex h-7 items-center gap-1 rounded-md border bg-surface-inset px-1.5 transition-colors hover:bg-surface-raised ${
            open ? "border-primary" : "border-border"
          }`}
        >
          <StrokeGlyph kind={activeStroke} />
          <ChevronDown className="size-3 text-muted" />
        </button>
      </Tooltip>
      {typeof document !== "undefined" && popover
        ? createPortal(popover, document.body)
        : null}
    </>
  );
}

/** Shape switcher for the selected player. Trigger glyph reflects the
 *  current shape; popover lists offense [circle / square / ★ Hot route]
 *  or defense [triangle / circle]. Picking ★ uses the canonical "star"
 *  shape value — the reducer keeps `isHotRoute` synced so Cal sees the
 *  hot route flag automatically. */
function ShapePopoverButton({
  options,
  value,
  disabled,
  isDefense,
  onChange,
}: {
  options: PlayerShapeOption[];
  value: PlayerShape | undefined;
  disabled: boolean;
  isDefense: boolean;
  onChange: (s: PlayerShape) => void;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, popRef, pos } = usePortalPopover(open, 168);

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
  }, [open, triggerRef, popRef]);

  // Pick the glyph that represents the current shape. Fallback to the
  // first option (Circle for offense, Triangle for defense) when value
  // is unknown or undefined.
  const current = options.find((o) => o.value === value) ?? options[0];
  const CurrentIcon = current.icon;
  const tooltip = disabled
    ? "Select a player to change shape"
    : isDefense
      ? "Player shape"
      : current.value === "star"
        ? "Hot route — change shape"
        : "Change shape (★ = hot route)";

  const popover = open && pos ? (
    <div
      ref={popRef}
      role="menu"
      data-editor-overlay="shape-picker"
      // Same tutorial allow + z-index treatment as the color picker
      // popover above — both portal to body and would otherwise be
      // clipped behind the spotlit toolbar (z:56) and have their
      // clicks eaten by the tutorial click block.
      data-tutor-allow=""
      style={{ position: "fixed", left: pos.left, top: pos.top, minWidth: "10.5rem" }}
      className="z-[57] flex flex-col gap-0.5 rounded-md border border-border bg-surface-raised p-1 shadow-lg"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        const isStar = opt.value === "star";
        return (
          <button
            key={opt.value}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
            className={`inline-flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors ${
              active
                ? "bg-primary/15 text-foreground"
                : "text-foreground hover:bg-surface-inset"
            }`}
          >
            <Icon
              className={`size-4 ${isStar ? "text-amber-400" : ""}`}
              fill={isStar ? "currentColor" : "none"}
            />
            <span className="font-medium">{opt.label}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <Tooltip content={tooltip}>
        <span className="inline-flex">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => !disabled && setOpen((v) => !v)}
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Player shape"
            className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              open
                ? "bg-surface-inset text-foreground"
                : "text-foreground hover:bg-surface-inset"
            }`}
          >
            <CurrentIcon
              className={`size-4 ${current.value === "star" ? "text-amber-400" : ""}`}
              fill={current.value === "star" ? "currentColor" : "none"}
            />
            <ChevronDown className="size-3 text-muted" />
          </button>
        </span>
      </Tooltip>
      {typeof document !== "undefined" && popover
        ? createPortal(popover, document.body)
        : null}
    </>
  );
}
