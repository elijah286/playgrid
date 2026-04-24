"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { Point2, Route, RouteNode, RouteSegment } from "@/domain/play/types";
import {
  routeToRenderedSegments,
  simplifyPolyline,
} from "@/domain/play/geometry";
import {
  resolveEndDecoration,
  resolveFieldZone,
  resolveLineOfScrimmage,
  resolveLineOfScrimmageY,
  resolveRouteStroke,
  resolveShowHashMarks,
  resolveHashStyle,
  hashColumnsForStyle,
  resolveShowYardNumbers,
  uid,
} from "@/domain/play/factory";

/* ------------------------------------------------------------------ */
/*  Interaction state machine                                         */
/* ------------------------------------------------------------------ */

type HitTarget =
  | { kind: "player"; playerId: string }
  | { kind: "route_node"; routeId: string; nodeId: string }
  | { kind: "route_segment"; routeId: string; segmentId: string }
  | { kind: "canvas" };

type Interaction =
  | { type: "idle" }
  | {
      type: "pending";
      origin: Point2;
      screenX: number;
      screenY: number;
      target: HitTarget;
    }
  | { type: "dragging_player"; playerId: string }
  | { type: "dragging_node"; routeId: string; nodeId: string }
  | { type: "dragging_segment"; routeId: string; segmentId: string }
  /** User is drawing freehand from an anchor (player or existing node) */
  | {
      type: "drawing_route";
      playerId: string;
      /** If set, extend this existing route instead of creating new */
      extendingRouteId: string | null;
      extendFromNodeId: string | null;
      /** Points captured during drag (first point = anchor position) */
      points: Point2[];
    };

const DRAG_THRESHOLD_PX = 5;
const SIMPLIFY_EPSILON = 0.012;

/* ------------------------------------------------------------------ */
/*  Visual constants                                                  */
/* ------------------------------------------------------------------ */

const NODE_RADIUS = 0.009;
// Minimum distance a non-anchor route node may sit from its carrier
// player. Matches the player's render radius (0.028) plus a little
// padding so stroke end-caps/arrows don't sit inside the circle.
const MIN_NODE_DIST_FROM_PLAYER = 0.034;

function snapOutsidePlayer(p: Point2, carrier: Point2): Point2 {
  const dx = p.x - carrier.x;
  const dy = p.y - carrier.y;
  const d = Math.hypot(dx, dy);
  if (d >= MIN_NODE_DIST_FROM_PLAYER) return p;
  if (d < 1e-6) {
    return { x: carrier.x, y: carrier.y + MIN_NODE_DIST_FROM_PLAYER };
  }
  return {
    x: carrier.x + (dx / d) * MIN_NODE_DIST_FROM_PLAYER,
    y: carrier.y + (dy / d) * MIN_NODE_DIST_FROM_PLAYER,
  };
}

// Background colors per mode. White is solid (main == dark) so the
// field reads as a crisp printed diagram.
const BG_COLORS: Record<string, { main: string; dark: string }> = {
  green: { main: "#2D8B4E", dark: "#247540" },
  white: { main: "#FFFFFF", dark: "#FFFFFF" },
  black: { main: "#0A0A0A", dark: "#141414" },
};

const LINE_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.30)",
  white: "rgba(0,0,0,0.55)",
  black: "rgba(255,255,255,0.22)",
};

/** Hash marks render a touch brighter than yard lines so they read clearly
 *  as on-field markings rather than blending into the background. */
const HASH_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.75)",
  white: "rgba(0,0,0,0.70)",
  black: "rgba(255,255,255,0.60)",
};

const NUMBER_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.85)",
  white: "rgba(0,0,0,0.80)",
  black: "rgba(255,255,255,0.70)",
};

/** Thin outline around the whole field so it visually separates from the
 *  page background (important on the white field theme, which otherwise
 *  blends into the app surface). */
const BORDER_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.35)",
  white: "rgba(0,0,0,0.50)",
  black: "rgba(255,255,255,0.30)",
};

/** Contrasting accent color per-background for the LOS marker and ball. */
const LOS_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.55)",
  white: "rgba(0,0,0,0.55)",
  black: "rgba(255,255,255,0.50)",
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

type Props = {
  doc: import("@/domain/play/types").PlayDocument;
  dispatch: (c: PlayCommand) => void;
  selectedPlayerId: string | null;
  selectedRouteId: string | null;
  selectedNodeId: string | null;
  selectedSegmentId: string | null;
  selectedZoneId?: string | null;
  onSelectPlayer: (id: string | null) => void;
  onSelectRoute: (id: string | null) => void;
  onSelectNode: (id: string | null) => void;
  onSelectSegment: (id: string | null) => void;
  onSelectZone?: (id: string | null) => void;
  activeShape: import("@/domain/play/types").SegmentShape;
  activeStrokePattern: import("@/domain/play/types").StrokePattern;
  /** Called after a segment has been drawn so the editor can reset one-shot
   *  strokes (motion) back to solid. */
  onActiveStrokePatternChange?: (p: import("@/domain/play/types").StrokePattern) => void;
  activeColor: string;
  activeWidth: number;
  /** Field aspect ratio (width / length) for the SVG viewBox */
  fieldAspect?: number;
  /** Editor mode: routes (default) or formation */
  mode?: "routes" | "formation";
  /** Called when user clicks empty canvas in formation mode */
  onAddPlayer?: (position: import("@/domain/play/types").Point2) => void;
  /** Field background color theme */
  fieldBackground?: "green" | "white" | "black" | "gray";
  /** Player IDs whose static tokens should be suppressed because an animation
   *  overlay is drawing them in motion. Routes, decorations, zones, and
   *  non-animating players all continue to render normally — the overlay only
   *  replaces the moving tokens and draws a gray trail on top of traversed
   *  route portions. */
  animatingPlayerIds?: ReadonlySet<string> | null;
  /** Optional opposing-side formation to render behind the play, in gray. */
  opponentFormation?: import("@/app/actions/formations").SavedFormation | null;
  /** Optional opposing players (from a play or formation) to render as ghosts. */
  opponentPlayers?: import("@/domain/play/types").Player[] | null;
  /** When true, canvas drags/clicks draw routes. When false, route drawing is
   *  suppressed so taps on empty canvas only deselect — avoids the footgun
   *  where a stray touch-drag silently created a route. Extending an existing
   *  anchor (clicking its node) still works in both modes. */
};

function parseColor(c: string): { r: number; g: number; b: number } | null {
  const s = c.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const full = hex.length === 3 ? hex.split("").map((h) => h + h).join("") : hex;
    if (full.length !== 6) return null;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
    if (parts.length >= 3) return { r: parts[0], g: parts[1], b: parts[2] };
  }
  return null;
}

/** Pick black or white for legibility against `fill`. If the stored
 *  `preferred` already contrasts well (≥ 3:1), keep it. */
function readableLabelColor(fill: string, preferred?: string): string {
  const rgb = parseColor(fill);
  if (!rgb) return preferred ?? "#1C1C1E";
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const auto = lum < 0.55 ? "#FFFFFF" : "#1C1C1E";
  if (!preferred) return auto;
  const pRgb = parseColor(preferred);
  if (!pRgb) return auto;
  const pLum = (0.299 * pRgb.r + 0.587 * pRgb.g + 0.114 * pRgb.b) / 255;
  // If preferred label is too close in luminance to the fill, override.
  if (Math.abs(pLum - lum) < 0.35) return auto;
  return preferred;
}

/**
 * Positions a floating context menu at (x, y) relative to `wrapperRef`, then
 * after mount measures its real size and clamps it so it stays fully inside
 * the wrapper's bounds — flipping to the left/above when it would overflow.
 * Prevents the mid-field right-click menu from being cut off near edges.
 */
function ClampedMenu({
  x,
  y,
  wrapperRef,
  className,
  children,
  onPointerDown,
  ...rest
}: {
  x: number;
  y: number;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
  children: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    const wrap = wrapperRef.current;
    if (!el || !wrap) return;
    const wr = wrap.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pad = 6;
    const left = Math.max(pad, Math.min(x, wr.width - w - pad));
    const top = Math.max(pad, Math.min(y, wr.height - h - pad));
    setPos({ left, top });
  }, [x, y, wrapperRef]);
  return (
    <div
      ref={ref}
      {...rest}
      className={className}
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={onPointerDown}
    >
      {children}
    </div>
  );
}

function EditorCanvasImpl({
  doc,
  dispatch,
  selectedPlayerId,
  selectedRouteId,
  selectedNodeId,
  selectedSegmentId,
  selectedZoneId = null,
  onSelectPlayer,
  onSelectRoute,
  onSelectNode,
  onSelectSegment,
  onSelectZone,
  activeShape,
  activeStrokePattern,
  onActiveStrokePatternChange,
  activeColor,
  activeWidth,
  fieldAspect = 1,
  mode = "routes",
  onAddPlayer,
  fieldBackground,
  animatingPlayerIds = null,
  opponentFormation = null,
  opponentPlayers = null,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [interaction, setInteraction] = useState<Interaction>({ type: "idle" });
  const interactionRef = useRef(interaction);
  // Cross-device double-tap tracker. React's onDoubleClick doesn't fire
  // reliably on iOS Safari/Android Chrome when touch-action suppresses the
  // synthetic click, so we recognise a double-tap ourselves from pointerdown
  // timing + target equality. Keyed by a string so "player:abc" and
  // "segment:r:s" stay distinct.
  const lastTapRef = useRef<{ key: string; at: number; x: number; y: number } | null>(
    null,
  );
  const DOUBLE_TAP_MS = 320;
  const DOUBLE_TAP_PX = 22;
  // Long-press timer for touch context menus. Opens the same player/segment
  // menus that Ctrl+click / right-click opens on desktop, so touch users
  // don't lose access to Delete / Add anchor / etc.
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; pointerId: number } | null>(null);
  const LONG_PRESS_MS = 500;
  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  }, []);
  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  /** Which route is the pointer currently hovering over (if any). */
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);

  /** When set, an inline input is rendered over the player so the label can
   *  be typed directly on the canvas. Committed on Enter/blur, cancelled on
   *  Esc. Capped at 2 characters. */
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);

  /* ---------- Right-click context menu state ---------- */
  type SegmentMenu = {
    /** Position in wrapper-relative CSS pixels (for absolute overlay) */
    screenX: number;
    screenY: number;
    routeId: string;
    segmentId: string;
    /** Click position in normalized field coords */
    position: Point2;
  };
  const [segmentMenu, setSegmentMenu] = useState<SegmentMenu | null>(null);

  type AnchorMenu = {
    screenX: number;
    screenY: number;
    routeId: string;
    nodeId: string;
  };
  const [anchorMenu, setAnchorMenu] = useState<AnchorMenu | null>(null);

  type PlayerMenu = {
    screenX: number;
    screenY: number;
    playerId: string;
  };
  const [playerMenu, setPlayerMenu] = useState<PlayerMenu | null>(null);

  type ZoneMenu = {
    screenX: number;
    screenY: number;
    zoneId: string;
  };
  const [zoneMenu, setZoneMenu] = useState<ZoneMenu | null>(null);

  // Ref holding the latest values the stable native contextmenu listener needs.
  // Assigned directly during render (safe for refs).
  const nativeMenuCtxRef = useRef({
    players: doc.layers.players,
    fieldAspect,
    mode,
    onSelectPlayer,
    onSelectRoute,
    onSelectNode,
    onSelectSegment,
  });
  nativeMenuCtxRef.current = {
    players: doc.layers.players,
    fieldAspect,
    mode,
    onSelectPlayer,
    onSelectRoute,
    onSelectNode,
    onSelectSegment,
  };

  // Native contextmenu listener on the WRAPPER in capture phase — fires before
  // React's entire synthetic event system and before any bubble-phase handlers.
  // This is the only reliable way to intercept right-clicks on SVG children on
  // macOS (Ctrl+click fires contextmenu with button=0, not pointerdown button=2).
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    function handleContextMenu(e: MouseEvent) {
      // Read the live SVG ref inside the handler so we always have the current element.
      const svg = svgRef.current;

      // Always suppress the browser's native right-click menu on the canvas.
      e.preventDefault();

      if (!svg) return;

      const {
        players,
        fieldAspect: fa,
        mode: m,
        onSelectPlayer: osp,
        onSelectRoute: osr,
        onSelectNode: osn,
        onSelectSegment: oss,
      } = nativeMenuCtxRef.current;

      if (m === "formation") return;

      // Convert screen coords → normalised field coords via the SVG's CTM.
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const inv = ctm.inverse();
      const svgX = inv.a * e.clientX + inv.c * e.clientY + inv.e;
      const svgY = inv.b * e.clientX + inv.d * e.clientY + inv.f;
      const normX = Math.min(1, Math.max(0, svgX / fa));
      const normY = Math.min(1, Math.max(0, 1 - svgY));

      // Hit-test players. Player visual radius is 0.028 SVG units; use 0.055
      // normalised for a generous click target.
      const HIT_RADIUS = 0.055;
      const hitPlayer = players.find((p) => {
        const dx = p.position.x - normX;
        const dy = p.position.y - normY;
        return Math.hypot(dx, dy) < HIT_RADIUS;
      });

      if (!hitPlayer) {
        // Not over a player — stop propagation here too so the event doesn't
        // bubble past the wrapper, but allow React's synthetic handlers on
        // segment hit-paths to still fire (they fire via React root, not native
        // bubbling past wrapper — React re-dispatches from the original target).
        return;
      }

      // Stop propagation so React's root contextmenu handler doesn't also fire.
      e.stopPropagation();

      const rect = wrapper!.getBoundingClientRect();
      const MENU_W = 180;
      const MENU_H = 90;
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      setPlayerMenu({
        screenX: Math.max(6, Math.min(localX, rect.width - MENU_W - 6)),
        screenY: Math.max(6, Math.min(localY, rect.height - MENU_H - 6)),
        playerId: hitPlayer.id,
      });
      setSegmentMenu(null);
      setAnchorMenu(null);
      osp(hitPlayer.id);
      osr(null);
      osn(null);
      oss(null);
    }

    // Capture phase: fires before any bubble-phase handlers and before React's
    // synthetic event system, which attaches at the root container.
    wrapper.addEventListener("contextmenu", handleContextMenu, true);
    return () => wrapper.removeEventListener("contextmenu", handleContextMenu, true);
  }, []); // stable — reads from nativeMenuCtxRef and svgRef directly

  // Dismiss the menu on any outside click / Escape
  useEffect(() => {
    if (!segmentMenu && !anchorMenu && !playerMenu && !zoneMenu) return;
    function onDocPointer(e: PointerEvent) {
      const target = e.target as Node | null;
      const wrap = wrapperRef.current;
      // Keep the menu open if the click is on the menu itself (the menu
      // renders inside the wrapper, but we check via data attribute).
      if (target instanceof HTMLElement && target.closest("[data-segment-menu]")) {
        return;
      }
      // Any other click closes the menu.
      setSegmentMenu(null);
      setAnchorMenu(null);
      setPlayerMenu(null);
      setZoneMenu(null);
      // Avoid double-handling: if the click was on the SVG we still want
      // our normal pointer logic to run, but we need to stop the menu
      // from blocking it.
      void wrap;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSegmentMenu(null);
        setAnchorMenu(null);
        setPlayerMenu(null);
        setZoneMenu(null);
      }
    }
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [segmentMenu, anchorMenu, playerMenu, zoneMenu]);

  /* ---------- Line of scrimmage (hoisted early; callbacks depend on losY) ---------- */

  const losY = resolveLineOfScrimmageY(doc);
  const losStyle = resolveLineOfScrimmage(doc);

  /* ---------- Coordinate conversion (resize-safe) ---------- */

  const toNorm = useCallback(
    (e: { clientX: number; clientY: number }): Point2 => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const ctm = el.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const inv = ctm.inverse();
      const svgX = inv.a * e.clientX + inv.c * e.clientY + inv.e;
      const svgY = inv.b * e.clientX + inv.d * e.clientY + inv.f;
      // Normalize to 0-1 regardless of viewBox aspect
      return {
        x: Math.min(1, Math.max(0, svgX / fieldAspect)),
        y: Math.min(1, Math.max(0, 1 - svgY)),
      };
    },
    [fieldAspect],
  );

  /* ---------- Active style builder ---------- */

  const buildRouteStyle = useCallback(
    (playerId?: string) => {
      const player = playerId
        ? doc.layers.players.find((p) => p.id === playerId)
        : null;
      // Default a new route to the player's fill color (their visible colour),
      // not their outline stroke which is usually near-black.
      const stroke = player?.style.fill ?? activeColor;
      return { stroke, strokeWidth: activeWidth };
    },
    [activeColor, activeWidth, doc.layers.players],
  );

  /* ---------- Anchor resolution ---------- */
  /** Where should the next stroke/node connect from? */
  const getAnchor = useCallback((): { routeId: string; nodeId: string; position: Point2 } | null => {
    // Priority 1: explicitly selected node
    if (selectedNodeId && selectedRouteId) {
      const route = doc.layers.routes.find((r) => r.id === selectedRouteId);
      const node = route?.nodes.find((n) => n.id === selectedNodeId);
      if (route && node) {
        return { routeId: route.id, nodeId: node.id, position: node.position };
      }
    }
    // Priority 2: any selected route → use its last node.
    // This covers both the "player + route selected" case AND the
    // "whole-route double-click" case where selectedPlayerId is null.
    // The playerId needed for new drawing is recovered from
    // route.carrierPlayerId inside the drawing handlers.
    if (selectedRouteId) {
      const route = doc.layers.routes.find((r) => r.id === selectedRouteId);
      if (route && route.nodes.length > 0) {
        const last = route.nodes[route.nodes.length - 1];
        return { routeId: route.id, nodeId: last.id, position: last.position };
      }
    }
    return null;
  }, [selectedNodeId, selectedRouteId, doc.layers.routes]);

  /* ---------- Create a route from a freehand path ---------- */

  const commitFreehandRoute = useCallback(
    (state: Extract<Interaction, { type: "drawing_route" }>) => {
      const { playerId, extendingRouteId, extendFromNodeId, points } = state;
      if (points.length < 2) return;
      const simplified = simplifyPolyline(points, SIMPLIFY_EPSILON);
      if (simplified.length < 2) return;

      const carrier = doc.layers.players.find((p) => p.id === playerId);
      if (carrier) {
        // Drop any trailing/intermediate points that fall within the player
        // circle (except the very first, which is the anchor position).
        for (let i = 1; i < simplified.length; i++) {
          const dx = simplified[i].x - carrier.position.x;
          const dy = simplified[i].y - carrier.position.y;
          if (Math.hypot(dx, dy) < MIN_NODE_DIST_FROM_PLAYER) {
            simplified[i] = snapOutsidePlayer(simplified[i], carrier.position);
          }
        }
      }
      if (simplified.length < 2) return;

      if (extendingRouteId && extendFromNodeId) {
        // Append new nodes onto existing route (skip index 0 = anchor position).
        // Motion only applies to the first segment of a brand-new route — when
        // extending, force solid.
        const extendStroke = activeStrokePattern === "motion" ? "solid" : activeStrokePattern;
        let prevNodeId = extendFromNodeId;
        let lastAddedId = prevNodeId;
        for (let i = 1; i < simplified.length; i++) {
          const newNode: RouteNode = { id: uid("node"), position: simplified[i] };
          dispatch({
            type: "route.addNode",
            routeId: extendingRouteId,
            node: newNode,
            afterNodeId: prevNodeId,
            shape: activeShape,
            strokePattern: extendStroke,
          });
          prevNodeId = newNode.id;
          lastAddedId = newNode.id;
        }
        onSelectRoute(extendingRouteId);
        onSelectNode(lastAddedId);
        onSelectSegment(null);
        if (activeStrokePattern === "motion") onActiveStrokePatternChange?.("solid");
        return;
      }

      // Create new route. Motion applies only to the first segment; the rest
      // fall back to solid.
      const nodes: RouteNode[] = simplified.map((pt) => ({
        id: uid("node"),
        position: pt,
      }));
      const segments: RouteSegment[] = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        const segStroke =
          activeStrokePattern === "motion" && i > 0 ? "solid" : activeStrokePattern;
        segments.push({
          id: uid("seg"),
          fromNodeId: nodes[i].id,
          toNodeId: nodes[i + 1].id,
          shape: activeShape,
          strokePattern: segStroke,
          controlOffset: null,
        });
      }
      const route: Route = {
        id: uid("route"),
        carrierPlayerId: playerId,
        semantic: null,
        nodes,
        segments,
        style: buildRouteStyle(playerId),
      };
      dispatch({ type: "route.add", route });
      onSelectRoute(route.id);
      onSelectNode(nodes[nodes.length - 1].id);
      onSelectSegment(null);
      if (activeStrokePattern === "motion") onActiveStrokePatternChange?.("solid");
    },
    [dispatch, onSelectRoute, onSelectNode, onSelectSegment, activeShape, activeStrokePattern, onActiveStrokePatternChange, buildRouteStyle, doc.layers.players],
  );

  /* ---------- Create a 2-node line route (single click, no existing route) ---------- */

  const commitClickRoute = useCallback(
    (playerId: string, playerPos: Point2, clickPos: Point2) => {
      const snapped = snapOutsidePlayer(clickPos, playerPos);
      const startNode: RouteNode = { id: uid("node"), position: playerPos };
      const endNode: RouteNode = { id: uid("node"), position: snapped };
      const seg: RouteSegment = {
        id: uid("seg"),
        fromNodeId: startNode.id,
        toNodeId: endNode.id,
        shape: activeShape,
        strokePattern: activeStrokePattern,
        controlOffset: null,
      };
      const route: Route = {
        id: uid("route"),
        carrierPlayerId: playerId,
        semantic: null,
        nodes: [startNode, endNode],
        segments: [seg],
        style: buildRouteStyle(playerId),
      };
      dispatch({ type: "route.add", route });
      onSelectRoute(route.id);
      onSelectNode(endNode.id); // so next click extends from here
      onSelectSegment(null);
      if (activeStrokePattern === "motion") onActiveStrokePatternChange?.("solid");
    },
    [dispatch, onSelectRoute, onSelectNode, onSelectSegment, activeShape, activeStrokePattern, onActiveStrokePatternChange, buildRouteStyle, doc.layers.players],
  );

  /* ---------- Pointer handlers ---------- */

  const startInteraction = useCallback(
    (e: React.PointerEvent, target: HitTarget) => {
      // Primary-button only. Right-clicks are handled by the context-menu
      // path (onContextMenu) and should not start a drag / selection.
      if (e.button !== 0) return;

      // Cross-device double-tap: if the same target was tapped recently and
      // close by, promote this pointerdown to a double-tap action and
      // suppress the normal interaction start so the state machine doesn't
      // also treat it as a fresh drag/select.
      const tapKey =
        target.kind === "player"
          ? `player:${target.playerId}`
          : target.kind === "route_segment"
            ? `seg:${target.routeId}:${target.segmentId}`
            : target.kind === "route_node"
              ? `node:${target.routeId}:${target.nodeId}`
              : "canvas";
      const now = performance.now();
      const last = lastTapRef.current;
      const isDouble =
        last &&
        last.key === tapKey &&
        now - last.at < DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_PX;
      lastTapRef.current = { key: tapKey, at: now, x: e.clientX, y: e.clientY };

      if (isDouble) {
        if (target.kind === "player") {
          onSelectPlayer(target.playerId);
          onSelectRoute(null);
          onSelectNode(null);
          onSelectSegment(null);
          onSelectZone?.(null);
          setEditingPlayerId(target.playerId);
          return;
        }
        if (target.kind === "route_segment") {
          onSelectRoute(target.routeId);
          onSelectSegment(null);
          onSelectNode(null);
          onSelectPlayer(null);
          onSelectZone?.(null);
          return;
        }
      }

      // Any interaction cancels the context menu and hover highlight.
      setSegmentMenu(null);
      setHoveredRouteId(null);
      const svg = svgRef.current;
      if (svg) svg.setPointerCapture(e.pointerId);
      const origin = toNorm(e);
      const next: Interaction = {
        type: "pending",
        origin,
        screenX: e.clientX,
        screenY: e.clientY,
        target,
      };
      setInteraction(next);
      interactionRef.current = next;

      if (target.kind === "player") {
        onSelectPlayer(target.playerId);
        onSelectRoute(null);
        onSelectNode(null);
        onSelectSegment(null);
        onSelectZone?.(null);
      }

      // Schedule a long-press → context menu. Only meaningful on touch
      // (pointerType === "touch"); mouse users have right-click already.
      // Any movement past the drag threshold or a pointerup will cancel.
      if (e.pointerType === "touch" && target.kind !== "canvas") {
        cancelLongPress();
        const startX = e.clientX;
        const startY = e.clientY;
        const capturedId = e.pointerId;
        const timer = setTimeout(() => {
          const wrap = wrapperRef.current;
          if (!wrap) return;
          const rect = wrap.getBoundingClientRect();
          const localX = Math.max(6, Math.min(startX - rect.left, rect.width - 186));
          const localY = Math.max(6, Math.min(startY - rect.top, rect.height - 106));
          try {
            navigator.vibrate?.(18);
          } catch {
            /* ignore */
          }
          // Cancel the pending pointer interaction so pointerup doesn't
          // also fire a selection on the same target.
          const svg = svgRef.current;
          try {
            svg?.releasePointerCapture(capturedId);
          } catch {
            /* may already be released */
          }
          setInteraction({ type: "idle" });
          interactionRef.current = { type: "idle" };

          if (target.kind === "player") {
            setPlayerMenu({ screenX: localX, screenY: localY, playerId: target.playerId });
          } else if (target.kind === "route_segment") {
            setSegmentMenu({
              screenX: localX,
              screenY: localY,
              routeId: target.routeId,
              segmentId: target.segmentId,
              position: origin,
            });
            onSelectRoute(target.routeId);
            onSelectSegment(target.segmentId);
            onSelectNode(null);
            onSelectPlayer(null);
          } else if (target.kind === "route_node") {
            setAnchorMenu({
              screenX: localX,
              screenY: localY,
              routeId: target.routeId,
              nodeId: target.nodeId,
            });
            onSelectRoute(target.routeId);
            onSelectNode(target.nodeId);
            onSelectSegment(null);
            onSelectPlayer(null);
          }
          longPressRef.current = null;
        }, LONG_PRESS_MS);
        longPressRef.current = { timer, pointerId: capturedId };
      }
    },
    [toNorm, onSelectPlayer, onSelectRoute, onSelectNode, onSelectSegment, onSelectZone, cancelLongPress],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      startInteraction(e, { kind: "canvas" });
    },
    [startInteraction],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const state = interactionRef.current;

      if (state.type === "idle") return;

      if (state.type === "pending") {
        const dx = e.clientX - state.screenX;
        const dy = e.clientY - state.screenY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        // Any real movement cancels a pending long-press.
        cancelLongPress();

        if (state.target.kind === "player") {
          const next: Interaction = {
            type: "dragging_player",
            playerId: state.target.playerId,
          };
          setInteraction(next);
          interactionRef.current = next;
          return;
        }

        if (state.target.kind === "route_node") {
          const next: Interaction = {
            type: "dragging_node",
            routeId: state.target.routeId,
            nodeId: state.target.nodeId,
          };
          setInteraction(next);
          interactionRef.current = next;
          return;
        }

        if (state.target.kind === "route_segment") {
          const next: Interaction = {
            type: "dragging_segment",
            routeId: state.target.routeId,
            segmentId: state.target.segmentId,
          };
          setInteraction(next);
          interactionRef.current = next;
          return;
        }

        // Canvas drag: start freehand from anchor (node/last-node) or player.
        if (state.target.kind === "canvas") {
          if (mode === "formation") return;

          const anchor = getAnchor();
          let startPos: Point2;
          let extendingRouteId: string | null = null;
          let extendFromNodeId: string | null = null;
          let playerId: string | null = null;

          if (anchor) {
            startPos = anchor.position;
            extendingRouteId = anchor.routeId;
            extendFromNodeId = anchor.nodeId;
            const route = doc.layers.routes.find((r) => r.id === anchor.routeId);
            playerId = route?.carrierPlayerId ?? selectedPlayerId ?? null;
          } else if (selectedPlayerId) {
            const player = doc.layers.players.find((p) => p.id === selectedPlayerId);
            if (!player) return;
            startPos = player.position;
            playerId = selectedPlayerId;
          } else {
            return;
          }

          if (!playerId) return;

          const next: Interaction = {
            type: "drawing_route",
            playerId,
            extendingRouteId,
            extendFromNodeId,
            points: [startPos, state.origin, toNorm(e)],
          };
          setInteraction(next);
          interactionRef.current = next;
          return;
        }

        return;
      }

      if (state.type === "dragging_player") {
        // Offensive players can't cross the LOS into defensive territory;
        // defensive players can't cross the LOS into offensive territory.
        const raw = toNorm(e);
        const isDefender =
          doc.metadata.playType === "defense" ||
          doc.layers.players.find((p) => p.id === state.playerId)?.role === "DL" ||
          doc.layers.players.find((p) => p.id === state.playerId)?.role === "LB" ||
          doc.layers.players.find((p) => p.id === state.playerId)?.role === "CB" ||
          doc.layers.players.find((p) => p.id === state.playerId)?.role === "S" ||
          doc.layers.players.find((p) => p.id === state.playerId)?.role === "NB";
        const clamped: Point2 = {
          x: raw.x,
          y: isDefender ? Math.max(raw.y, losY) : Math.min(raw.y, losY),
        };
        dispatch({
          type: "player.move",
          playerId: state.playerId,
          position: clamped,
        });
        return;
      }

      if (state.type === "dragging_node") {
        const raw = toNorm(e);
        const route = doc.layers.routes.find((r) => r.id === state.routeId);
        const isAnchor = route?.nodes[0]?.id === state.nodeId;
        const carrier = route
          ? doc.layers.players.find((p) => p.id === route.carrierPlayerId)
          : null;
        const position =
          !isAnchor && carrier
            ? snapOutsidePlayer(raw, carrier.position)
            : raw;
        dispatch({
          type: "route.moveNode",
          routeId: state.routeId,
          nodeId: state.nodeId,
          position,
        });
        return;
      }

      if (state.type === "dragging_segment") {
        // Only allow the drag-to-bend gesture when the user is actively in
        // curve mode. In straight/dashed/etc. modes, dragging a segment
        // should not silently convert it to a curve — that surprised users
        // who expected the active line type to be respected.
        if (activeShape !== "curve") return;
        const p = toNorm(e);
        dispatch({
          type: "route.setSegmentShape",
          routeId: state.routeId,
          segmentId: state.segmentId,
          shape: "curve",
        });
        dispatch({
          type: "route.setSegmentControl",
          routeId: state.routeId,
          segmentId: state.segmentId,
          controlOffset: p,
        });
        return;
      }

      if (state.type === "drawing_route") {
        const p = toNorm(e);
        const next: Interaction = { ...state, points: [...state.points, p] };
        setInteraction(next);
        interactionRef.current = next;
        return;
      }
    },
    [toNorm, dispatch, selectedPlayerId, doc.layers.players, doc.layers.routes, getAnchor, mode, losY, activeShape, cancelLongPress],
  );

  const finishInteraction = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Pointerup cancels any armed long-press. If the long-press already
      // fired, the state is "idle" and the normal completion branch below
      // no-ops cleanly.
      cancelLongPress();
      const state = interactionRef.current;

      if (state.type === "pending") {
        const { target } = state;
        if (target.kind === "route_node") {
          onSelectRoute(target.routeId);
          onSelectNode(target.nodeId);
          onSelectSegment(null);
          onSelectPlayer(null);
          onSelectZone?.(null);
        } else if (target.kind === "route_segment") {
          onSelectRoute(target.routeId);
          onSelectSegment(target.segmentId);
          onSelectNode(null);
          onSelectPlayer(null);
          onSelectZone?.(null);
        } else if (target.kind === "canvas") {
          if (mode === "formation") {
            // Formation mode: clicking canvas adds a player. Clamp to LOS
            // so offensive players can't be spawned past the line.
            if (onAddPlayer) {
              onAddPlayer({
                x: state.origin.x,
                y: Math.min(state.origin.y, losY),
              });
            } else {
              // Deselect if no handler
              onSelectPlayer(null);
            }
          } else {
            // Canvas click (no drag) — route mode
            const anchor = getAnchor();
            if (anchor) {
              // Extend existing route: add a node connected to anchor.
              // Motion is one-shot — force solid when extending and reset.
              const extendStroke = activeStrokePattern === "motion" ? "solid" : activeStrokePattern;
              const newNode: RouteNode = { id: uid("node"), position: state.origin };
              dispatch({
                type: "route.addNode",
                routeId: anchor.routeId,
                node: newNode,
                afterNodeId: anchor.nodeId,
                shape: activeShape,
                strokePattern: extendStroke,
              });
              if (activeStrokePattern === "motion") onActiveStrokePatternChange?.("solid");
              onSelectNode(newNode.id);
            } else if (selectedPlayerId) {
              const player = doc.layers.players.find((p) => p.id === selectedPlayerId);
              if (player) {
                commitClickRoute(selectedPlayerId, player.position, state.origin);
              }
            } else {
              // Nothing selected → deselect all
              onSelectPlayer(null);
              onSelectRoute(null);
              onSelectNode(null);
              onSelectSegment(null);
              onSelectZone?.(null);
            }
          }
        }
      }

      if (state.type === "drawing_route") {
        commitFreehandRoute(state);
      }

      try {
        (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
      } catch {
        // may already be released
      }
      const next: Interaction = { type: "idle" };
      setInteraction(next);
      interactionRef.current = next;
    },
    [
      onSelectPlayer, onSelectRoute, onSelectNode, onSelectSegment,
      selectedPlayerId, doc.layers.players, commitClickRoute, commitFreehandRoute,
      getAnchor, dispatch, activeShape, activeStrokePattern, mode, onAddPlayer, losY,
      onActiveStrokePatternChange, onSelectZone, cancelLongPress,
    ],
  );

  /* ---------- Double-click: select the whole route (marching ants) ---------- */

  const handleSegmentDoubleClick = useCallback(
    (routeId: string, _segmentId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      // Whole-route selection = route selected but no specific segment.
      onSelectRoute(routeId);
      onSelectSegment(null);
      onSelectNode(null);
      onSelectPlayer(null);
    },
    [onSelectRoute, onSelectSegment, onSelectNode, onSelectPlayer],
  );

  /* ---------- Right-click on segment: context menu ---------- */

  const handleSegmentContextMenu = useCallback(
    (routeId: string, segmentId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const wrap = wrapperRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const p = toNorm(e as unknown as { clientX: number; clientY: number });
      // Clamp the menu inside the wrapper so we never need to read the ref
      // during render. ~180px wide, ~100px tall with a 6px safe margin.
      const MENU_W = 180;
      const MENU_H = 100;
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const clampedX = Math.max(6, Math.min(localX, rect.width - MENU_W - 6));
      const clampedY = Math.max(6, Math.min(localY, rect.height - MENU_H - 6));
      setSegmentMenu({
        screenX: clampedX,
        screenY: clampedY,
        routeId,
        segmentId,
        position: p,
      });
      // Select the route so the user knows which one the menu targets.
      onSelectRoute(routeId);
      onSelectSegment(segmentId);
      onSelectNode(null);
      onSelectPlayer(null);
    },
    [toNorm, onSelectRoute, onSelectSegment, onSelectNode, onSelectPlayer],
  );

  const handleAnchorDelete = useCallback(() => {
    if (!anchorMenu) return;
    dispatch({
      type: "route.removeNodeBridging",
      routeId: anchorMenu.routeId,
      nodeId: anchorMenu.nodeId,
    });
    onSelectNode(null);
    setAnchorMenu(null);
  }, [anchorMenu, dispatch, onSelectNode]);

  const setTerminalSegmentStroke = useCallback(
    (pattern: "solid" | "dashed" | "dotted") => {
      if (!segmentMenu) return;
      dispatch({
        type: "route.setSegmentStroke",
        routeId: segmentMenu.routeId,
        segmentId: segmentMenu.segmentId,
        strokePattern: pattern,
      });
      setSegmentMenu(null);
    },
    [segmentMenu, dispatch],
  );

  // Is the segment the terminal (end) of its route? Used to show dash-style
  // options only on the last leg.
  const handleMenuAddAnchor = useCallback(() => {
    if (!segmentMenu) return;
    const newNode: RouteNode = { id: uid("node"), position: segmentMenu.position };
    dispatch({
      type: "route.insertNode",
      routeId: segmentMenu.routeId,
      segmentId: segmentMenu.segmentId,
      node: newNode,
    });
    onSelectRoute(segmentMenu.routeId);
    onSelectNode(newNode.id);
    onSelectSegment(null);
    setSegmentMenu(null);
  }, [segmentMenu, dispatch, onSelectRoute, onSelectNode, onSelectSegment]);

  const handleMenuCreateBranch = useCallback(() => {
    if (!segmentMenu) return;
    const { routeId, segmentId, position } = segmentMenu;
    const route = doc.layers.routes.find((r) => r.id === routeId);
    const seg = route?.segments.find((s) => s.id === segmentId);
    if (!route || !seg) {
      setSegmentMenu(null);
      return;
    }
    // Branch from the segment's "from" node so the user sees a fork starting
    // at an existing anchor. The new node lands at the click position, and
    // we select it so the user can immediately drag or extend it.
    const newNode: RouteNode = { id: uid("node"), position };
    // Motion is one-shot — a branch counts as a new segment extension, so
    // force solid and reset the active pattern.
    const branchStroke = activeStrokePattern === "motion" ? "solid" : activeStrokePattern;
    dispatch({
      type: "route.addBranch",
      routeId,
      fromNodeId: seg.fromNodeId,
      toNode: newNode,
      shape: activeShape,
      strokePattern: branchStroke,
    });
    if (activeStrokePattern === "motion") onActiveStrokePatternChange?.("solid");
    onSelectRoute(routeId);
    onSelectNode(newNode.id);
    onSelectSegment(null);
    setSegmentMenu(null);
  }, [
    segmentMenu,
    doc.layers.routes,
    dispatch,
    activeShape,
    activeStrokePattern,
    onSelectRoute,
    onSelectNode,
    onSelectSegment,
    onActiveStrokePatternChange,
  ]);

  /* ---------- Dynamic cursor ---------- */

  let svgCursor = selectedPlayerId || selectedRouteId ? "crosshair" : "default";
  if (interaction.type === "dragging_player") svgCursor = "grabbing";
  if (interaction.type === "dragging_node") svgCursor = "grabbing";
  if (interaction.type === "dragging_segment") svgCursor = "grabbing";
  if (interaction.type === "drawing_route") svgCursor = "crosshair";

  /* ---------- ViewBox + coordinate helpers  ---------- */

  // ViewBox: width = fieldAspect, height = 1 (so x in 0..fieldAspect, y in 0..1)
  // Field x (0..1) → SVG x = x * fieldAspect
  // Field y (0..1, up) → SVG y = 1 - y
  const fx = (x: number) => x * fieldAspect;
  const fy = (y: number) => 1 - y;

  /* ---------- Dynamic field colors ---------- */

  // Legacy "gray" plays fall back to the new solid-white theme.
  const bgKey = fieldBackground === "gray" ? "white" : (fieldBackground ?? "green");
  const bg = BG_COLORS[bgKey];
  const lineColor = LINE_COLORS[bgKey];
  const hashColor = HASH_COLORS[bgKey];
  const numberColor = NUMBER_COLORS[bgKey];
  const borderColor = BORDER_COLORS[bgKey];
  const losColor = LOS_COLORS[bgKey];

  /* ---------- Line of scrimmage ---------- */

  // SVG-y for the LOS line (flipped because y=0 is bottom).
  const losSvgY = fy(losY);

  /* ---------- Yard lines ---------- */

  // Draw a stripe every 5 yards based on the field's length.
  // Field y-axis is 0..1 over `fieldLengthYds`, so a 25-yard field gets
  // 4 interior stripes at y = 0.2, 0.4, 0.6, 0.8.
  const fieldLengthYds = doc.sportProfile.fieldLengthYds || 25;
  const yardInterval = 5;
  const yardLines = [];
  const yardNumbers: React.ReactNode[] = [];
  const losYd = Math.round(losY * fieldLengthYds); // yards from bottom to LOS
  const zone = resolveFieldZone(doc);
  // Anchor yard value at LOS based on zone.
  const losYardValue = zone === "midfield" ? 50 : 20;
  const yardLabel = (yd: number) => {
    // yd is yards from bottom edge of window; offset from LOS in yards:
    const delta = yd - losYd;
    if (zone === "midfield") {
      // Mirror around the 50: number counts down as you move away from LOS.
      const v = 50 - Math.abs(delta);
      if (v <= 0 || v % 5 !== 0) return "";
      return String(v);
    }
    // red_zone: offense driving toward the goal (top of window). Numbers
    // descend going up (toward goal), ascend going down (back toward midfield).
    const v = losYardValue - delta;
    if (v <= 0) return "G";
    if (v >= 50 || v % 5 !== 0) return "";
    return String(v);
  };
  const showYardNumbers = resolveShowYardNumbers(doc);
  // Iterate 5-yard marks anchored to the LOS (not the bottom of the window),
  // so the LOS always sits on a yard line and the numbers always appear at
  // the expected ±5, ±10, ... offsets regardless of where the LOS lands.
  const firstBelowLos = losYd - Math.floor(losYd / yardInterval) * yardInterval;
  for (let yd = firstBelowLos; yd < fieldLengthYds; yd += yardInterval) {
    if (yd <= 0) continue;
    const y = yd / fieldLengthYds;
    const svgY = fy(y);
    // Skip the solid stripe exactly at LOS — the dashed LOS line draws there.
    if (yd !== losYd) {
      yardLines.push(
        <line
          key={`h${yd}`}
          x1={0}
          y1={svgY}
          x2={fieldAspect}
          y2={svgY}
          stroke={lineColor}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
    const label = yardLabel(yd);
    if (label && showYardNumbers) {
      // Numbers sit just inside each hash column — the same location they
      // appear on a real field (between the sideline and the hash).
      const numY = svgY + 0.018;
      const NUM_X_LEFT = 0.27 * fieldAspect;
      const NUM_X_RIGHT = 0.73 * fieldAspect;
      yardNumbers.push(
        <text
          key={`nL${yd}`}
          x={NUM_X_LEFT}
          y={numY}
          fontSize={0.04}
          fontWeight={700}
          fill={numberColor}
          textAnchor="middle"
          pointerEvents="none"
        >
          {label}
        </text>,
        <text
          key={`nR${yd}`}
          x={NUM_X_RIGHT}
          y={numY}
          fontSize={0.04}
          fontWeight={700}
          fill={numberColor}
          textAnchor="middle"
          pointerEvents="none"
        >
          {label}
        </text>,
      );
    }
  }

  /* ---------- Hash marks ---------- */
  // Two columns of short vertical ticks at ~38% / 62% of width — the
  // standard college-ish hash geometry. Ticks run parallel to the
  // length axis (y), perpendicular to yard lines.
  const showHash = resolveShowHashMarks(doc);
  const hashMarks: React.ReactNode[] = [];
  if (showHash) {
    const [leftFrac, rightFrac] = hashColumnsForStyle(resolveHashStyle(doc));
    const HASH_X_LEFT = leftFrac * fieldAspect;
    const HASH_X_RIGHT = rightFrac * fieldAspect;
    const TICK_HALF = 0.010; // half-length of each tick in field-units
    const N_TICKS = 20; // 20 ticks along the length ≈ every 5%
    for (let i = 1; i < N_TICKS; i++) {
      const y = i / N_TICKS;
      hashMarks.push(
        <line
          key={`hml${i}`}
          x1={HASH_X_LEFT}
          y1={y - TICK_HALF}
          x2={HASH_X_LEFT}
          y2={y + TICK_HALF}
          stroke={hashColor}
          strokeWidth={2.25}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />,
        <line
          key={`hmr${i}`}
          x1={HASH_X_RIGHT}
          y1={y - TICK_HALF}
          x2={HASH_X_RIGHT}
          y2={y + TICK_HALF}
          stroke={hashColor}
          strokeWidth={2.25}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
  }

  /* ---------- Draft drawing path ---------- */

  const draftPath = (() => {
    if (interaction.type !== "drawing_route") return null;
    const pts = interaction.points;
    if (pts.length < 2) return null;
    const parts: string[] = [];
    pts.forEach((p, i) => {
      parts.push(i === 0 ? `M ${fx(p.x)} ${fy(p.y)}` : `L ${fx(p.x)} ${fy(p.y)}`);
    });
    return parts.join(" ");
  })();

  /* ---------- Route rendering helper ---------- */
  // We need to re-render segment `d` strings with the fieldAspect scaling.
  // Easiest: scale the SVG content by wrapping in a <g transform>. The routes
  // stored positions are still in normalized 0-1 field coords.

  return (
    <div ref={wrapperRef} className="relative h-full min-h-0 w-full select-none overflow-hidden" style={{ WebkitUserSelect: "none", userSelect: "none" }}>
    <svg
      ref={svgRef}
      viewBox={`0 0 ${fieldAspect} 1`}
      preserveAspectRatio="xMidYMin meet"
      className="block h-full w-full touch-none rounded-xl shadow-card"
      style={{ cursor: svgCursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishInteraction}
      onPointerLeave={finishInteraction}
      onContextMenu={(e) => {
        // Prevent the browser menu anywhere on the canvas; segment-specific
        // menu is wired on the hit-path onContextMenu above.
        e.preventDefault();
      }}
    >
      <defs>
        <linearGradient id="fieldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bg.main} />
          <stop offset="100%" stopColor={bg.dark} />
        </linearGradient>
      </defs>
      <rect width={fieldAspect} height={1} fill="url(#fieldGrad)" />
      {yardLines}
      {yardNumbers}
      {hashMarks}

      {/* Line of scrimmage */}
      {losStyle === "line" && (
        <line
          x1={0}
          y1={losSvgY}
          x2={fieldAspect}
          y2={losSvgY}
          stroke={losColor}
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {losStyle === "football" && (() => {
        const cx = fieldAspect / 2;
        const cy = losSvgY;
        // Football oriented along the direction of play (along y-axis).
        // rx across width, ry along length; ry > rx so the ball is upright.
        const rx = 0.014;
        const ry = 0.028;
        return (
          <g pointerEvents="none">
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fill="#8B4513"
              stroke="#FFFFFF"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* White laces: one central stripe + four cross-ties */}
            <line
              x1={cx}
              y1={cy - ry * 0.55}
              x2={cx}
              y2={cy + ry * 0.55}
              stroke="#FFFFFF"
              strokeWidth={1.25}
              vectorEffect="non-scaling-stroke"
            />
            {[-0.35, -0.15, 0.05, 0.25].map((t, i) => (
              <line
                key={i}
                x1={cx - rx * 0.35}
                y1={cy + ry * t}
                x2={cx + rx * 0.35}
                y2={cy + ry * t}
                stroke="#FFFFFF"
                strokeWidth={1.25}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        );
      })()}

      {/* Rush line (flag defense): dashed line at losY + rushLineYards / fieldLengthYds. */}
      {doc.metadata.playType === "defense" && (doc.showRushLine ?? true) && (() => {
        const rushYds = doc.rushLineYards ?? 7;
        const rushY = losY + rushYds / fieldLengthYds;
        if (rushY >= 1) return null;
        const rushSvgY = fy(rushY);
        return (
          <g pointerEvents="none">
            <line
              x1={0}
              y1={rushSvgY}
              x2={fieldAspect}
              y2={rushSvgY}
              stroke={losColor}
              strokeWidth={1.25}
              strokeDasharray="3 6"
              vectorEffect="non-scaling-stroke"
              opacity={0.7}
            />
            <text
              x={0.01}
              y={rushSvgY - 0.004}
              fontSize={0.018}
              fontWeight={600}
              fill={losColor}
              opacity={0.85}
            >
              Rush {rushYds}y
            </text>
          </g>
        );
      })()}

      {/* Coverage zones (defense). Rendered above the field, below routes/players. */}
      {(doc.layers.zones ?? []).map((z) => {
          const cx = z.center.x * fieldAspect;
          const cy = 1 - z.center.y;
          const w = z.size.w * fieldAspect;
          const h = z.size.h;
          return (
            <g
              key={z.id}
              onContextMenu={(e) => {
                if (mode === "formation") return;
                e.preventDefault();
                e.stopPropagation();
                const wrap = wrapperRef.current;
                if (!wrap) return;
                const rect = wrap.getBoundingClientRect();
                const MENU_W = 220;
                const MENU_H = 160;
                const localX = e.clientX - rect.left;
                const localY = e.clientY - rect.top;
                setZoneMenu({
                  screenX: Math.max(6, Math.min(localX, rect.width - MENU_W - 6)),
                  screenY: Math.max(6, Math.min(localY, rect.height - MENU_H - 6)),
                  zoneId: z.id,
                });
                setPlayerMenu(null);
                setSegmentMenu(null);
                setAnchorMenu(null);
              }}
              onPointerDown={(e) => {
                if (mode === "formation") return;
                e.stopPropagation();
                // Select this zone and clear other selections.
                onSelectZone?.(z.id);
                onSelectPlayer(null);
                onSelectRoute(null);
                onSelectNode(null);
                onSelectSegment(null);
                const svg = svgRef.current;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                const startX = e.clientX;
                const startY = e.clientY;
                const startCenter = { x: z.center.x, y: z.center.y };
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                const onMove = (ev: PointerEvent) => {
                  const dx = (ev.clientX - startX) / rect.width; // 0..fieldAspect per 1
                  const dy = (ev.clientY - startY) / rect.height;
                  const nx = Math.max(0, Math.min(1, startCenter.x + dx / fieldAspect));
                  const ny = Math.max(0, Math.min(1, startCenter.y - dy));
                  dispatch({
                    type: "zone.update",
                    zoneId: z.id,
                    patch: { center: { x: nx, y: ny } },
                  });
                };
                const onUp = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
              style={{ cursor: "move" }}
            >
              {z.kind === "rectangle" ? (
                <rect
                  x={cx - w}
                  y={cy - h}
                  width={w * 2}
                  height={h * 2}
                  fill={z.style.fill}
                  stroke={z.style.stroke}
                  strokeWidth={selectedZoneId === z.id ? 2.5 : 1.5}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                  rx={0.01}
                />
              ) : (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={w}
                  ry={h}
                  fill={z.style.fill}
                  stroke={z.style.stroke}
                  strokeWidth={selectedZoneId === z.id ? 2.5 : 1.5}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {/* Resize handles — only visible when this zone is selected. */}
              {selectedZoneId === z.id && (() => {
                const handleR = 0.012;
                type Axis =
                  | "n" | "s" | "e" | "w"
                  | "ne" | "nw" | "se" | "sw";
                const startResize = (ev: React.PointerEvent, axis: Axis) => {
                  ev.stopPropagation();
                  const svg = svgRef.current;
                  if (!svg) return;
                  const rect = svg.getBoundingClientRect();
                  const startX = ev.clientX;
                  const startY = ev.clientY;
                  const startW = z.size.w;
                  const startH = z.size.h;
                  (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
                  const onMove = (m: PointerEvent) => {
                    const dx = (m.clientX - startX) / rect.width / fieldAspect;
                    const dy = -(m.clientY - startY) / rect.height;
                    let nw = startW;
                    let nh = startH;
                    if (axis.includes("e")) nw = startW + dx;
                    if (axis.includes("w")) nw = startW - dx;
                    if (axis.includes("n")) nh = startH + dy;
                    if (axis.includes("s")) nh = startH - dy;
                    dispatch({
                      type: "zone.update",
                      zoneId: z.id,
                      patch: {
                        size: {
                          w: Math.max(0.02, Math.min(0.5, nw)),
                          h: Math.max(0.02, Math.min(0.5, nh)),
                        },
                      },
                    });
                  };
                  const onUp = () => {
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                };
                const Handle = ({
                  hx,
                  hy,
                  axis,
                  cursor,
                }: {
                  hx: number;
                  hy: number;
                  axis: Axis;
                  cursor: string;
                }) => (
                  <rect
                    x={hx - handleR}
                    y={hy - handleR}
                    width={handleR * 2}
                    height={handleR * 2}
                    fill="#ffffff"
                    stroke={z.style.stroke}
                    strokeWidth={1.25}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor }}
                    onPointerDown={(e) => startResize(e, axis)}
                  />
                );
                if (z.kind === "rectangle") {
                  return (
                    <>
                      <Handle hx={cx - w} hy={cy - h} axis="nw" cursor="nwse-resize" />
                      <Handle hx={cx + w} hy={cy - h} axis="ne" cursor="nesw-resize" />
                      <Handle hx={cx - w} hy={cy + h} axis="sw" cursor="nesw-resize" />
                      <Handle hx={cx + w} hy={cy + h} axis="se" cursor="nwse-resize" />
                      <Handle hx={cx} hy={cy - h} axis="n" cursor="ns-resize" />
                      <Handle hx={cx} hy={cy + h} axis="s" cursor="ns-resize" />
                      <Handle hx={cx + w} hy={cy} axis="e" cursor="ew-resize" />
                      <Handle hx={cx - w} hy={cy} axis="w" cursor="ew-resize" />
                    </>
                  );
                }
                return (
                  <>
                    <Handle hx={cx + w} hy={cy} axis="e" cursor="ew-resize" />
                    <Handle hx={cx - w} hy={cy} axis="w" cursor="ew-resize" />
                    <Handle hx={cx} hy={cy - h} axis="n" cursor="ns-resize" />
                    <Handle hx={cx} hy={cy + h} axis="s" cursor="ns-resize" />
                  </>
                );
              })()}
            </g>
          );
        })}

      {/* Opponent play ghost overlay (gray players only, no interaction). */}
      {opponentPlayers && opponentPlayers.length > 0 && (
        <g pointerEvents="none" opacity={0.55}>
          {opponentPlayers.map((pl) => {
            const cx = pl.position.x * fieldAspect;
            const cy = 1 - pl.position.y;
            const r = 0.028;
            return (
              <g key={`oppplay-${pl.id}`} transform={`translate(${cx} ${cy})`}>
                <circle
                  cx={0}
                  cy={0}
                  r={r}
                  fill="#9ca3af"
                  stroke="#4b5563"
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={0.028}
                  fontWeight={700}
                  fill="#1f2937"
                  style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                >
                  {pl.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Opponent formation ghost overlay (gray, no routes, no interaction). */}
      {opponentFormation && (
        <g pointerEvents="none" opacity={0.55}>
          {opponentFormation.players.map((pl) => {
            const cx = pl.position.x * fieldAspect;
            const cy = 1 - pl.position.y;
            const r = 0.028;
            return (
              <g key={`opp-${pl.id}`} transform={`translate(${cx} ${cy})`}>
                <circle
                  cx={0}
                  cy={0}
                  r={r}
                  fill="#9ca3af"
                  stroke="#4b5563"
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={0.028}
                  fontWeight={700}
                  fill="#1f2937"
                  style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                >
                  {pl.label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Routes — wrap in a group scaled by fieldAspect on x */}
      <g transform={`scale(${fieldAspect}, 1)`}>
        {doc.layers.routes.map((route) => {
          const isActive = route.id === selectedRouteId && mode !== "formation";
          const isHovered = route.id === hoveredRouteId && !isActive && mode !== "formation";
          // "Whole-route" selection = route selected but no specific segment.
          const isWholeRouteSelected = isActive && selectedSegmentId == null;
          const rendered = routeToRenderedSegments(route);
          const effectiveStroke = resolveRouteStroke(route, doc.layers.players);

          return (
            <g key={route.id}>
              {rendered.map((rs) => {
                const isSelectedSeg = rs.segmentId === selectedSegmentId && isActive;
                const showAnts = isSelectedSeg || isWholeRouteSelected;
                return (
                  <g key={rs.segmentId}>
                    {/* Hover glow — rendered beneath the route line so it
                        shows as a soft halo without obscuring the stroke. */}
                    {isHovered && (
                      <path
                        d={rs.d}
                        fill="none"
                        stroke="rgba(255,255,255,0.35)"
                        strokeWidth={10}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                    )}
                    <path
                      d={rs.d}
                      fill="none"
                      stroke={isSelectedSeg ? "#F26522" : effectiveStroke}
                      strokeWidth={isSelectedSeg ? 3 : route.style.strokeWidth}
                      strokeDasharray={rs.dash}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                    {/* Marching-ants selection overlay */}
                    {showAnts && (
                      <path
                        className="marching-ants"
                        d={rs.d}
                        fill="none"
                        stroke="#F26522"
                        strokeWidth={isSelectedSeg ? 4 : 3}
                        strokeDasharray="4 3"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                    )}
                    {/* Transparent hit-path — sits on top of everything so
                        pointer events land reliably. 18 px CSS-pixel target
                        (non-scaling) makes it easy to click narrow routes.
                        Previous value was 0.025 with non-scaling-stroke which
                        rendered sub-pixel and was effectively unclickable. */}
                    {mode !== "formation" && (
                      <path
                        d={rs.d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={18}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: isHovered ? "pointer" : "default" }}
                        onPointerEnter={() => setHoveredRouteId(route.id)}
                        onPointerLeave={() => setHoveredRouteId(null)}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          startInteraction(e, {
                            kind: "route_segment",
                            routeId: route.id,
                            segmentId: rs.segmentId,
                          });
                        }}
                        onDoubleClick={(e) =>
                          handleSegmentDoubleClick(route.id, rs.segmentId, e)
                        }
                        onContextMenu={(e) =>
                          handleSegmentContextMenu(route.id, rs.segmentId, e)
                        }
                      />
                    )}
                  </g>
                );
              })}

              {/* Anchor dots: render whenever the route is selected (segment,
                  node, or whole-route view), so users can tap anchors to move
                  them or click segments to edit them. */}
              {isActive &&
                route.nodes.map((node) => {
                  const isSelectedNode = node.id === selectedNodeId;
                  // Nodes live inside the scale(fieldAspect, 1) group, which
                  // would stretch a <circle> into a horizontal ellipse. Use
                  // <ellipse> with rx pre-compensated so the rendered shape is
                  // a perfect circle of radius NODE_RADIUS in field-units.
                  return (
                    <g key={node.id}>
                      {isSelectedNode && (
                        <ellipse
                          cx={node.position.x}
                          cy={1 - node.position.y}
                          rx={(NODE_RADIUS * 2.2) / fieldAspect}
                          ry={NODE_RADIUS * 2.2}
                          fill="none"
                          stroke="#F26522"
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                      )}
                      <ellipse
                        cx={node.position.x}
                        cy={1 - node.position.y}
                        rx={NODE_RADIUS / fieldAspect}
                        ry={NODE_RADIUS}
                        fill={isSelectedNode ? "#F26522" : "#FFFFFF"}
                        stroke={isSelectedNode ? "#F26522" : "rgba(0,0,0,0.35)"}
                        strokeWidth={0.0015}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: "grab" }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          startInteraction(e, {
                            kind: "route_node",
                            routeId: route.id,
                            nodeId: node.id,
                          });
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = wrapperRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          const MENU_W = 160;
                          const MENU_H = 40;
                          const localX = e.clientX - rect.left;
                          const localY = e.clientY - rect.top;
                          setAnchorMenu({
                            screenX: Math.max(6, Math.min(localX, rect.width - MENU_W - 6)),
                            screenY: Math.max(6, Math.min(localY, rect.height - MENU_H - 6)),
                            routeId: route.id,
                            nodeId: node.id,
                          });
                          setSegmentMenu(null);
                          onSelectRoute(route.id);
                          onSelectNode(node.id);
                          onSelectSegment(null);
                        }}
                      />
                    </g>
                  );
                })}
            </g>
          );
        })}
      </g>

      {/* Draft freehand preview (already in scaled coords via fx/fy) */}
      {draftPath && (
        <path
          d={draftPath}
          fill="none"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}

      {/* End-of-route decorations (arrow / T / none). Rendered outside the
          fieldAspect scale group so angles stay isotropic. Kept visible
          during playback so the route's terminal intent stays readable. */}
      {doc.layers.routes.map((route) => {
        const decoration = resolveEndDecoration(route);
        if (decoration === "none") return null;

        // Terminal nodes: appear as `toNodeId` but never as `fromNodeId`.
        const fromIds = new Set(route.segments.map((s) => s.fromNodeId));
        const terminals = route.segments.filter(
          (s) => !fromIds.has(s.toNodeId),
        );
        if (terminals.length === 0) return null;

        const effectiveRouteStroke = resolveRouteStroke(route, doc.layers.players);

        return (
          <g key={`deco-${route.id}`} pointerEvents="none">
            {terminals.map((seg) => {
              const fromNode = route.nodes.find((n) => n.id === seg.fromNodeId);
              const toNode = route.nodes.find((n) => n.id === seg.toNodeId);
              if (!fromNode || !toNode) return null;

              // For a curved segment with a controlOffset, approximate the
              // tangent at the tip as the vector from the control to the end.
              let dirFromX: number;
              let dirFromY: number;
              if (seg.shape === "curve" && seg.controlOffset) {
                dirFromX = seg.controlOffset.x;
                dirFromY = seg.controlOffset.y;
              } else {
                dirFromX = fromNode.position.x;
                dirFromY = fromNode.position.y;
              }

              // Work in SVG-space so 1 unit is isotropic (viewBox preserves
              // aspect ratio). fx scales x by fieldAspect, fy flips y.
              const tipX = fx(toNode.position.x);
              const tipY = fy(toNode.position.y);
              const fromX = fx(dirFromX);
              const fromY = fy(dirFromY);
              const dxS = tipX - fromX;
              const dyS = tipY - fromY;
              const len = Math.hypot(dxS, dyS);
              if (len < 1e-4) return null;
              const ux = dxS / len;
              const uy = dyS / len;

              const stroke = effectiveRouteStroke;
              const strokeW = route.style.strokeWidth;

              if (decoration === "arrow") {
                const arrowLen = 0.028;
                const cosA = Math.cos(Math.PI / 6); // 30°
                const sinA = Math.sin(Math.PI / 6);
                // Back-direction, rotated ±30°
                const bx = -ux;
                const by = -uy;
                const r1x = cosA * bx - sinA * by;
                const r1y = sinA * bx + cosA * by;
                const r2x = cosA * bx + sinA * by;
                const r2y = -sinA * bx + cosA * by;
                return (
                  <g key={seg.id}>
                    <line
                      x1={tipX}
                      y1={tipY}
                      x2={tipX + arrowLen * r1x}
                      y2={tipY + arrowLen * r1y}
                      stroke={stroke}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1={tipX}
                      y1={tipY}
                      x2={tipX + arrowLen * r2x}
                      y2={tipY + arrowLen * r2y}
                      stroke={stroke}
                      strokeWidth={strokeW}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              }

              if (decoration === "t") {
                const halfLen = 0.022;
                // Perpendicular to direction
                const perpX = -uy;
                const perpY = ux;
                return (
                  <line
                    key={seg.id}
                    x1={tipX + perpX * halfLen}
                    y1={tipY + perpY * halfLen}
                    x2={tipX - perpX * halfLen}
                    y2={tipY - perpY * halfLen}
                    stroke={stroke}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              }

              return null;
            })}
          </g>
        );
      })}

      {/* Players — suppress tokens that are being animated by the overlay. */}
      {doc.layers.players.filter((pl) => !animatingPlayerIds?.has(pl.id)).map((pl) => {
        const sel = pl.id === selectedPlayerId;
        const isDragging =
          interaction.type === "dragging_player" && interaction.playerId === pl.id;
        const px = fx(pl.position.x);
        const py = fy(pl.position.y);
        const r = 0.028;
        const fillColor = pl.style?.fill ?? "#FFFFFF";
        const strokeColor = pl.style?.stroke ?? "rgba(0,0,0,0.6)";
        // With vectorEffect=non-scaling-stroke these widths are in CSS pixels.
        const strokeW = sel ? 2 : 1.5;
        const labelColor = readableLabelColor(fillColor, pl.style?.labelColor);
        const selectionRingColor = pl.style?.stroke ?? "#1C1C1E";
        const shape = pl.shape ?? "circle";

        const pointerHandlers = {
          style: { cursor: isDragging ? "grabbing" : "grab" } as React.CSSProperties,
          onPointerDown: (e: React.PointerEvent) => {
            e.stopPropagation();
            // Right-clicks are handled by the native contextmenu listener above.
            // startInteraction already guards button !== 0, so pass through always.
            startInteraction(e, { kind: "player", playerId: pl.id });
          },
          onDoubleClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            setEditingPlayerId(pl.id);
          },
        };

        let shapeEl: React.ReactNode;
        if (shape === "circle") {
          shapeEl = (
            <circle
              cx={px}
              cy={py}
              r={r}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeW}
              vectorEffect="non-scaling-stroke"
              {...pointerHandlers}
            />
          );
        } else if (shape === "square") {
          const half = r;
          shapeEl = (
            <rect
              x={px - half}
              y={py - half}
              width={half * 2}
              height={half * 2}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeW}
              vectorEffect="non-scaling-stroke"
              {...pointerHandlers}
            />
          );
        } else if (shape === "diamond") {
          const pts = `${px},${py - r} ${px + r},${py} ${px},${py + r} ${px - r},${py}`;
          shapeEl = (
            <polygon
              points={pts}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeW}
              vectorEffect="non-scaling-stroke"
              {...pointerHandlers}
            />
          );
        } else if (shape === "star") {
          const outer = r * 1.15;
          const inner = outer * 0.45;
          const pts = Array.from({ length: 10 }, (_, i) => {
            const angle = -Math.PI / 2 + (i * Math.PI) / 5;
            const rad = i % 2 === 0 ? outer : inner;
            return `${px + rad * Math.cos(angle)},${py + rad * Math.sin(angle)}`;
          }).join(" ");
          shapeEl = (
            <polygon
              points={pts}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeW}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              {...pointerHandlers}
            />
          );
        } else {
          // triangle — point toward offense (down on screen, since defense sits up-field)
          const pts = `${px},${py + r} ${px + r},${py - r} ${px - r},${py - r}`;
          shapeEl = (
            <polygon
              points={pts}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeW}
              vectorEffect="non-scaling-stroke"
              {...pointerHandlers}
            />
          );
        }

        return (
          <g key={pl.id}>
            {sel && (
              <circle
                className="marching-ants"
                cx={px}
                cy={py}
                r={0.042}
                fill="none"
                stroke={selectionRingColor}
                strokeWidth={2}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {shapeEl}
            {editingPlayerId !== pl.id && (
              <text
                x={px}
                y={py + 0.01}
                textAnchor="middle"
                fontSize={0.022}
                fontWeight={700}
                fill={labelColor}
                pointerEvents="none"
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              >
                {pl.label}
              </text>
            )}
            {editingPlayerId === pl.id && (() => {
              // Float the editor above the player so the marker stays visible
              // and the text field reads as a dedicated tooltip-style input.
              // Clamp to the field bounds so edge players don't push it off.
              const w = r * 3.2;
              const h = r * 1.9;
              const gap = r * 0.45;
              let ex = px - w / 2;
              if (ex < 0.005) ex = 0.005;
              if (ex + w > fieldAspect - 0.005) ex = fieldAspect - 0.005 - w;
              let ey = py - r - gap - h;
              let tailBelow = true;
              if (ey < 0.005) {
                ey = py + r + gap;
                tailBelow = false;
              }
              const tailCx = Math.max(ex + 0.008, Math.min(ex + w - 0.008, px));
              const tailCy = tailBelow ? ey + h : ey;
              const tailDy = tailBelow ? gap : -gap;
              return (
                <g>
                <path
                  d={`M ${tailCx - 0.008} ${tailCy} L ${tailCx} ${tailCy + tailDy} L ${tailCx + 0.008} ${tailCy} Z`}
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <foreignObject
                  x={ex}
                  y={ey}
                  width={w}
                  height={h}
                  style={{ overflow: "visible" }}
                >
                  <input
                    autoFocus
                    defaultValue={pl.label}
                    maxLength={2}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const next = e.currentTarget.value.slice(0, 2);
                        dispatch({ type: "player.setLabel", playerId: pl.id, label: next });
                        setEditingPlayerId(null);
                      } else if (e.key === "Escape") {
                        setEditingPlayerId(null);
                      }
                      e.stopPropagation();
                    }}
                    onBlur={(e) => {
                      const next = e.currentTarget.value.slice(0, 2);
                      dispatch({ type: "player.setLabel", playerId: pl.id, label: next });
                      setEditingPlayerId(null);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "2px solid #2563eb",
                      borderRadius: "4px",
                      outline: "none",
                      boxShadow: "0 0 0 3px rgba(37,99,235,0.25), 0 2px 8px rgba(0,0,0,0.15)",
                      background: "#ffffff",
                      color: "#111827",
                      textAlign: "center",
                      fontFamily: "Inter, system-ui, sans-serif",
                      fontWeight: 700,
                      fontSize: "12px",
                      padding: 0,
                      textTransform: "uppercase",
                      caretColor: "#2563eb",
                    }}
                  />
                </foreignObject>
                </g>
              );
            })()}
          </g>
        );
      })}

      {/* Field border — drawn last so it sits on top of the field content. */}
      <rect
        x={0}
        y={0}
        width={fieldAspect}
        height={1}
        fill="none"
        stroke={borderColor}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    </svg>

      {/* Segment context menu */}
      {segmentMenu && (
        <ClampedMenu
          data-segment-menu
          wrapperRef={wrapperRef}
          x={segmentMenu.screenX}
          y={segmentMenu.screenY}
          className="absolute z-20 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-elevated"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-inset"
            onClick={handleMenuAddAnchor}
          >
            Add anchor here
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-inset"
            onClick={handleMenuCreateBranch}
          >
            Create branch here
          </button>
          <div className="border-t border-border" />
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted">
            Segment style
          </div>
          {(["solid", "dashed", "dotted"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-surface-inset"
              onClick={() => setTerminalSegmentStroke(p)}
            >
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
          <div className="border-t border-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface-inset"
            onClick={() => {
              if (!segmentMenu) return;
              const route = doc.layers.routes.find((r) => r.id === segmentMenu.routeId);
              const seg = route?.segments.find((s) => s.id === segmentMenu.segmentId);
              if (route && seg) {
                // Remove just this segment by dropping its end node and
                // bridging neighbors. If it's the only segment, the route
                // collapses to a single node and is removed outright.
                if (route.segments.length <= 1) {
                  dispatch({ type: "route.remove", routeId: route.id });
                  onSelectRoute(null);
                } else {
                  dispatch({
                    type: "route.removeNodeBridging",
                    routeId: route.id,
                    nodeId: seg.toNodeId,
                  });
                }
              }
              onSelectSegment(null);
              onSelectNode(null);
              setSegmentMenu(null);
            }}
          >
            Delete segment
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface-inset"
            onClick={() => {
              if (!segmentMenu) return;
              dispatch({ type: "route.remove", routeId: segmentMenu.routeId });
              onSelectRoute(null);
              onSelectSegment(null);
              onSelectNode(null);
              setSegmentMenu(null);
            }}
          >
            Delete route
          </button>
        </ClampedMenu>
      )}
      {anchorMenu && (
        <ClampedMenu
          data-segment-menu
          wrapperRef={wrapperRef}
          x={anchorMenu.screenX}
          y={anchorMenu.screenY}
          className="absolute z-20 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-elevated"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface-inset"
            onClick={handleAnchorDelete}
          >
            Delete anchor
          </button>
        </ClampedMenu>
      )}

      {/* Player context menu */}
      {playerMenu && mode !== "formation" && (() => {
        const hasRoutes = doc.layers.routes.some(
          (r) => r.carrierPlayerId === playerMenu.playerId,
        );
        return (
          <ClampedMenu
            data-segment-menu
            wrapperRef={wrapperRef}
            x={playerMenu.screenX}
            y={playerMenu.screenY}
            className="absolute z-20 min-w-[180px] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-elevated py-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={!hasRoutes}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-inset disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                dispatch({ type: "player.flipRoutes", playerId: playerMenu.playerId });
                setPlayerMenu(null);
              }}
            >
              Flip route
            </button>
            <button
              type="button"
              disabled={!hasRoutes}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface-inset disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                dispatch({ type: "player.clearRoutes", playerId: playerMenu.playerId });
                setPlayerMenu(null);
              }}
            >
              Clear all routes
            </button>
          </ClampedMenu>
        );
      })()}

      {/* Zone context menu */}
      {zoneMenu && mode !== "formation" && (() => {
        const z = (doc.layers.zones ?? []).find((zn) => zn.id === zoneMenu.zoneId);
        if (!z) return null;
        return (
          <ClampedMenu
            data-segment-menu
            wrapperRef={wrapperRef}
            x={zoneMenu.screenX}
            y={zoneMenu.screenY}
            className="absolute z-20 min-w-[180px] overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-elevated"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-inset"
              onClick={() => {
                dispatch({
                  type: "zone.add",
                  zone: {
                    ...z,
                    id: uid("zn"),
                    center: {
                      x: Math.min(1, z.center.x + 0.04),
                      y: Math.max(0, z.center.y - 0.04),
                    },
                  },
                });
                setZoneMenu(null);
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface-inset"
              onClick={() => {
                dispatch({ type: "zone.remove", zoneId: z.id });
                setZoneMenu(null);
              }}
            >
              Delete
            </button>
          </ClampedMenu>
        );
      })()}
    </div>
  );
}

/**
 * Memoized to prevent re-renders on every RAF tick when the parent re-renders
 * for animation progress. All callers pass stable references (dispatch,
 * setState setters, useMemo'd sets) so shallow prop compare is sufficient.
 */
export const EditorCanvas = memo(EditorCanvasImpl);
