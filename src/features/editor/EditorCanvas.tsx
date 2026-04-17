"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { Point2, Route, RouteNode, RouteSegment } from "@/domain/play/types";
import {
  routeToRenderedSegments,
  simplifyPolyline,
} from "@/domain/play/geometry";
import { resolveShowHashMarks, uid } from "@/domain/play/factory";

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

// Background colors per mode
const BG_COLORS: Record<string, { main: string; dark: string }> = {
  green: { main: "#2D8B4E", dark: "#247540" },
  white: { main: "#F8FAFC", dark: "#E2E8F0" },
  black: { main: "#0A0A0A", dark: "#141414" },
  gray:  { main: "#1E1E2E", dark: "#16161E" },
};

const LINE_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.15)",
  white: "rgba(0,0,0,0.08)",
  black: "rgba(255,255,255,0.10)",
  gray:  "rgba(255,255,255,0.10)",
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
  onSelectPlayer: (id: string | null) => void;
  onSelectRoute: (id: string | null) => void;
  onSelectNode: (id: string | null) => void;
  onSelectSegment: (id: string | null) => void;
  activeShape: import("@/domain/play/types").SegmentShape;
  activeStrokePattern: import("@/domain/play/types").StrokePattern;
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
};

export function EditorCanvas({
  doc,
  dispatch,
  selectedPlayerId,
  selectedRouteId,
  selectedNodeId,
  selectedSegmentId,
  onSelectPlayer,
  onSelectRoute,
  onSelectNode,
  onSelectSegment,
  activeShape,
  activeStrokePattern,
  activeColor,
  activeWidth,
  fieldAspect = 1,
  mode = "routes",
  onAddPlayer,
  fieldBackground,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [interaction, setInteraction] = useState<Interaction>({ type: "idle" });
  const interactionRef = useRef(interaction);
  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

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

  // Dismiss the menu on any outside click / Escape
  useEffect(() => {
    if (!segmentMenu) return;
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
      // Avoid double-handling: if the click was on the SVG we still want
      // our normal pointer logic to run, but we need to stop the menu
      // from blocking it.
      void wrap;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSegmentMenu(null);
    }
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [segmentMenu]);

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
    () => ({ stroke: activeColor, strokeWidth: activeWidth }),
    [activeColor, activeWidth],
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
    // Priority 2: selected route belongs to selected player → use last node
    if (selectedPlayerId && selectedRouteId) {
      const route = doc.layers.routes.find((r) => r.id === selectedRouteId);
      if (route && route.carrierPlayerId === selectedPlayerId && route.nodes.length > 0) {
        const last = route.nodes[route.nodes.length - 1];
        return { routeId: route.id, nodeId: last.id, position: last.position };
      }
    }
    return null;
  }, [selectedNodeId, selectedRouteId, selectedPlayerId, doc.layers.routes]);

  /* ---------- Create a route from a freehand path ---------- */

  const commitFreehandRoute = useCallback(
    (state: Extract<Interaction, { type: "drawing_route" }>) => {
      const { playerId, extendingRouteId, extendFromNodeId, points } = state;
      if (points.length < 2) return;
      const simplified = simplifyPolyline(points, SIMPLIFY_EPSILON);
      if (simplified.length < 2) return;

      if (extendingRouteId && extendFromNodeId) {
        // Append new nodes onto existing route (skip index 0 = anchor position)
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
            strokePattern: activeStrokePattern,
          });
          prevNodeId = newNode.id;
          lastAddedId = newNode.id;
        }
        onSelectRoute(extendingRouteId);
        onSelectNode(lastAddedId);
        onSelectSegment(null);
        return;
      }

      // Create new route
      const nodes: RouteNode[] = simplified.map((pt) => ({
        id: uid("node"),
        position: pt,
      }));
      const segments: RouteSegment[] = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        segments.push({
          id: uid("seg"),
          fromNodeId: nodes[i].id,
          toNodeId: nodes[i + 1].id,
          shape: activeShape,
          strokePattern: activeStrokePattern,
          controlOffset: null,
        });
      }
      const route: Route = {
        id: uid("route"),
        carrierPlayerId: playerId,
        semantic: null,
        nodes,
        segments,
        style: buildRouteStyle(),
      };
      dispatch({ type: "route.add", route });
      onSelectRoute(route.id);
      onSelectNode(nodes[nodes.length - 1].id);
      onSelectSegment(null);
    },
    [dispatch, onSelectRoute, onSelectNode, onSelectSegment, activeShape, activeStrokePattern, buildRouteStyle],
  );

  /* ---------- Create a 2-node line route (single click, no existing route) ---------- */

  const commitClickRoute = useCallback(
    (playerId: string, playerPos: Point2, clickPos: Point2) => {
      const startNode: RouteNode = { id: uid("node"), position: playerPos };
      const endNode: RouteNode = { id: uid("node"), position: clickPos };
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
        style: buildRouteStyle(),
      };
      dispatch({ type: "route.add", route });
      onSelectRoute(route.id);
      onSelectNode(endNode.id); // so next click extends from here
      onSelectSegment(null);
    },
    [dispatch, onSelectRoute, onSelectNode, onSelectSegment, activeShape, activeStrokePattern, buildRouteStyle],
  );

  /* ---------- Pointer handlers ---------- */

  const startInteraction = useCallback(
    (e: React.PointerEvent, target: HitTarget) => {
      // Primary-button only. Right-clicks are handled by the context-menu
      // path (onContextMenu) and should not start a drag / selection.
      if (e.button !== 0) return;
      // Any interaction cancels the context menu.
      setSegmentMenu(null);
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
      }
    },
    [toNorm, onSelectPlayer, onSelectRoute, onSelectNode, onSelectSegment],
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

        // Canvas drag: start freehand from anchor (node/last-node) or player
        if (state.target.kind === "canvas") {
          // In formation mode, canvas drag does nothing (no route drawing)
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
        dispatch({
          type: "player.move",
          playerId: state.playerId,
          position: toNorm(e),
        });
        return;
      }

      if (state.type === "dragging_node") {
        dispatch({
          type: "route.moveNode",
          routeId: state.routeId,
          nodeId: state.nodeId,
          position: toNorm(e),
        });
        return;
      }

      if (state.type === "dragging_segment") {
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
    [toNorm, dispatch, selectedPlayerId, doc.layers.players, doc.layers.routes, getAnchor, mode],
  );

  const finishInteraction = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const state = interactionRef.current;

      if (state.type === "pending") {
        const { target } = state;
        if (target.kind === "route_node") {
          onSelectRoute(target.routeId);
          onSelectNode(target.nodeId);
          onSelectSegment(null);
          onSelectPlayer(null);
        } else if (target.kind === "route_segment") {
          onSelectRoute(target.routeId);
          onSelectSegment(target.segmentId);
          onSelectNode(null);
          onSelectPlayer(null);
        } else if (target.kind === "canvas") {
          if (mode === "formation") {
            // Formation mode: clicking canvas adds a player
            if (onAddPlayer) {
              onAddPlayer(state.origin);
            } else {
              // Deselect if no handler
              onSelectPlayer(null);
            }
          } else {
            // Canvas click (no drag) — route mode
            const anchor = getAnchor();
            if (anchor) {
              // Extend existing route: add a node connected to anchor
              const newNode: RouteNode = { id: uid("node"), position: state.origin };
              dispatch({
                type: "route.addNode",
                routeId: anchor.routeId,
                node: newNode,
                afterNodeId: anchor.nodeId,
                shape: activeShape,
                strokePattern: activeStrokePattern,
              });
              onSelectNode(newNode.id);
            } else if (selectedPlayerId) {
              // Start new route from player
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
      getAnchor, dispatch, activeShape, activeStrokePattern, mode, onAddPlayer,
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
    dispatch({
      type: "route.addBranch",
      routeId,
      fromNodeId: seg.fromNodeId,
      toNode: newNode,
      shape: activeShape,
      strokePattern: activeStrokePattern,
    });
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

  const bg = BG_COLORS[fieldBackground ?? "green"];
  const lineColor = LINE_COLORS[fieldBackground ?? "green"];

  /* ---------- Yard lines ---------- */

  const yardLines = [];
  for (let i = 1; i < 10; i++) {
    const y = i / 10;
    yardLines.push(
      <line
        key={`h${i}`}
        x1={0}
        y1={y}
        x2={fieldAspect}
        y2={y}
        stroke={lineColor}
        strokeWidth={0.002}
      />,
    );
  }

  /* ---------- Hash marks ---------- */
  // Two columns of short vertical ticks at ~38% / 62% of width — the
  // standard college-ish hash geometry. Ticks run parallel to the
  // length axis (y), perpendicular to yard lines.
  const showHash = resolveShowHashMarks(doc);
  const hashMarks: React.ReactNode[] = [];
  if (showHash) {
    const HASH_X_LEFT = 0.38 * fieldAspect;
    const HASH_X_RIGHT = 0.62 * fieldAspect;
    const TICK_HALF = 0.006; // half-length of each tick in field-units
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
          stroke={lineColor}
          strokeWidth={0.0018}
        />,
        <line
          key={`hmr${i}`}
          x1={HASH_X_RIGHT}
          y1={y - TICK_HALF}
          x2={HASH_X_RIGHT}
          y2={y + TICK_HALF}
          stroke={lineColor}
          strokeWidth={0.0018}
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
    <div ref={wrapperRef} className="relative h-full w-full">
    <svg
      ref={svgRef}
      viewBox={`0 0 ${fieldAspect} 1`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none rounded-xl shadow-card"
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
      {hashMarks}

      {/* Routes — wrap in a group scaled by fieldAspect on x */}
      <g transform={`scale(${fieldAspect}, 1)`}>
        {doc.layers.routes.map((route) => {
          const isActive = route.id === selectedRouteId && mode !== "formation";
          // "Whole-route" selection = route selected but no specific segment.
          const isWholeRouteSelected = isActive && selectedSegmentId == null;
          const rendered = routeToRenderedSegments(route);

          return (
            <g key={route.id}>
              {rendered.map((rs) => {
                const isSelectedSeg = rs.segmentId === selectedSegmentId && isActive;
                const showAnts = isSelectedSeg || isWholeRouteSelected;
                return (
                  <g key={rs.segmentId}>
                    {mode !== "formation" && (
                      <path
                        d={rs.d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={0.025}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: "pointer" }}
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
                    <path
                      d={rs.d}
                      fill="none"
                      stroke={isSelectedSeg ? "#F26522" : route.style.stroke}
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
                  </g>
                );
              })}

              {isActive &&
                route.nodes.map((node) => {
                  const isSelectedNode = node.id === selectedNodeId;
                  // Nodes live inside the scale(fieldAspect, 1) group, which
                  // would stretch a <circle> into a horizontal ellipse. Use
                  // <ellipse> with rx pre-compensated so the rendered shape is
                  // a perfect circle of radius NODE_RADIUS in field-units.
                  return (
                    <ellipse
                      key={node.id}
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
                    />
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

      {/* Players */}
      {doc.layers.players.map((pl) => {
        const sel = pl.id === selectedPlayerId;
        const isDragging =
          interaction.type === "dragging_player" && interaction.playerId === pl.id;
        const px = fx(pl.position.x);
        const py = fy(pl.position.y);
        const r = 0.028;
        const fillColor = sel ? "#F26522" : (pl.style?.fill ?? "#FFFFFF");
        const strokeColor = sel ? "#F26522" : (pl.style?.stroke ?? "rgba(0,0,0,0.3)");
        const strokeW = sel ? 0.004 : 0.003;
        const labelColor = sel ? "#FFFFFF" : (pl.style?.labelColor ?? "#1C1C1E");
        const shape = pl.shape ?? "circle";

        const pointerHandlers = {
          style: { cursor: isDragging ? "grabbing" : "grab" } as React.CSSProperties,
          onPointerDown: (e: React.PointerEvent) => {
            e.stopPropagation();
            startInteraction(e, { kind: "player", playerId: pl.id });
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
        } else {
          // triangle
          const pts = `${px},${py - r} ${px + r},${py + r} ${px - r},${py + r}`;
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
                cx={px}
                cy={py}
                r={0.042}
                fill="none"
                stroke="#F26522"
                strokeWidth={0.003}
                vectorEffect="non-scaling-stroke"
                opacity={0.5}
                pointerEvents="none"
              />
            )}
            {shapeEl}
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
          </g>
        );
      })}
    </svg>

      {/* Segment context menu */}
      {segmentMenu && (
        <div
          data-segment-menu
          className="absolute z-20 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-elevated"
          style={{
            left: segmentMenu.screenX,
            top: segmentMenu.screenY,
          }}
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
        </div>
      )}
    </div>
  );
}
