"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { Player, Point2, Route, RouteNode, RouteSegment } from "@/domain/play/types";
import {
  routeToRenderedSegments,
  closestPointOnLine,
  strokePatternToDash,
} from "@/domain/play/geometry";
import { uid } from "@/domain/play/factory";

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
  | { type: "dragging_segment"; routeId: string; segmentId: string; origin: Point2 }
  | { type: "placing_route"; routeId: string; lastNodeId: string; cursorPos: Point2 | null };

const DRAG_THRESHOLD_PX = 5;

/* ------------------------------------------------------------------ */
/*  Visual constants                                                  */
/* ------------------------------------------------------------------ */

const FIELD_BG = "#2D8B4E";
const FIELD_DARK = "#247540";
const LINE_COLOR = "rgba(255,255,255,0.15)";
const NODE_RADIUS = 0.012;
const NODE_HIT_RADIUS = 0.02;

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
  placingRoute: boolean;
  onPlacingRouteChange: (placing: boolean) => void;
  /** Active shape/stroke for new segments */
  activeShape: import("@/domain/play/types").SegmentShape;
  activeStrokePattern: import("@/domain/play/types").StrokePattern;
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
  placingRoute,
  onPlacingRouteChange,
  activeShape,
  activeStrokePattern,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [interaction, setInteraction] = useState<Interaction>({ type: "idle" });
  const interactionRef = useRef(interaction);
  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

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
      return {
        x: Math.min(1, Math.max(0, svgX)),
        y: Math.min(1, Math.max(0, 1 - svgY)),
      };
    },
    [],
  );

  /* ---------- Helper: find the route being placed ---------- */

  const placingState =
    interaction.type === "placing_route" ? interaction : null;

  /* ---------- Pointer handlers ---------- */

  const startInteraction = useCallback(
    (e: React.PointerEvent, target: HitTarget) => {
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
      const p = toNorm(e);

      // If we're in placing mode, add a new node
      if (placingState) {
        const newNode: RouteNode = { id: uid("node"), position: p };
        dispatch({
          type: "route.addNode",
          routeId: placingState.routeId,
          node: newNode,
          afterNodeId: placingState.lastNodeId,
          shape: activeShape,
          strokePattern: activeStrokePattern,
        });
        const next: Interaction = {
          type: "placing_route",
          routeId: placingState.routeId,
          lastNodeId: newNode.id,
          cursorPos: p,
        };
        setInteraction(next);
        interactionRef.current = next;
        return;
      }

      // If a player is selected and we click canvas (not on any element),
      // and we have a selected node on a route → branch
      if (selectedNodeId && selectedRouteId) {
        const newNode: RouteNode = { id: uid("node"), position: p };
        dispatch({
          type: "route.addBranch",
          routeId: selectedRouteId,
          fromNodeId: selectedNodeId,
          toNode: newNode,
          shape: activeShape,
          strokePattern: activeStrokePattern,
        });
        onSelectNode(newNode.id);
        return;
      }

      // If a player is selected but no route is selected, start placing a new route
      if (selectedPlayerId && !selectedRouteId) {
        const firstNode: RouteNode = { id: uid("node"), position: p };
        const routeId = uid("route");
        const route: Route = {
          id: routeId,
          carrierPlayerId: selectedPlayerId,
          semantic: null,
          nodes: [firstNode],
          segments: [],
          style: { stroke: "#FFFFFF", strokeWidth: 2.5 },
        };
        dispatch({ type: "route.add", route });
        onSelectRoute(routeId);
        onSelectNode(firstNode.id);
        const next: Interaction = {
          type: "placing_route",
          routeId,
          lastNodeId: firstNode.id,
          cursorPos: p,
        };
        setInteraction(next);
        interactionRef.current = next;
        onPlacingRouteChange(true);
        return;
      }

      // Default: canvas click for deselect
      startInteraction(e, { kind: "canvas" });
    },
    [
      toNorm, placingState, selectedNodeId, selectedRouteId, selectedPlayerId,
      dispatch, activeShape, activeStrokePattern, onSelectRoute, onSelectNode,
      onPlacingRouteChange, startInteraction,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const state = interactionRef.current;

      // Update cursor position during placing
      if (state.type === "placing_route") {
        const p = toNorm(e);
        const next: Interaction = { ...state, cursorPos: p };
        setInteraction(next);
        interactionRef.current = next;
        return;
      }

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
            origin: state.origin,
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
        // Dragging a segment sets a manual control offset for curve reshaping
        const p = toNorm(e);
        dispatch({
          type: "route.setSegmentControl",
          routeId: state.routeId,
          segmentId: state.segmentId,
          controlOffset: p,
        });
        // Also switch the segment to curve if it isn't already
        dispatch({
          type: "route.setSegmentShape",
          routeId: state.routeId,
          segmentId: state.segmentId,
          shape: "curve",
        });
        return;
      }
    },
    [toNorm, dispatch],
  );

  const finishInteraction = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const state = interactionRef.current;

      // Don't finish if we're placing
      if (state.type === "placing_route") return;

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
          onSelectPlayer(null);
          onSelectRoute(null);
          onSelectNode(null);
          onSelectSegment(null);
        }
        // player: already selected on pointerdown
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
    [onSelectPlayer, onSelectRoute, onSelectNode, onSelectSegment],
  );

  /** Called externally (Done button, Escape, Enter) to finish placing */
  const finishPlacing = useCallback(() => {
    // If the route has only one node and no segments, remove it
    if (placingState) {
      const route = doc.layers.routes.find((r) => r.id === placingState.routeId);
      if (route && route.nodes.length <= 1) {
        dispatch({ type: "route.remove", routeId: placingState.routeId });
        onSelectRoute(null);
      }
    }
    const next: Interaction = { type: "idle" };
    setInteraction(next);
    interactionRef.current = next;
    onPlacingRouteChange(false);
    onSelectNode(null);
  }, [placingState, doc.layers.routes, dispatch, onSelectRoute, onSelectNode, onPlacingRouteChange]);

  // Expose finishPlacing via keyboard
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.key === "Escape" || e.key === "Enter") && placingState) {
        e.preventDefault();
        finishPlacing();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [placingState, finishPlacing]);

  // Expose finishPlacing to parent
  useEffect(() => {
    // Store on the SVG element for parent access
    const el = svgRef.current;
    if (el) (el as unknown as Record<string, unknown>).__finishPlacing = finishPlacing;
  }, [finishPlacing]);

  /* ---------- Double-click: insert node on segment ---------- */

  const handleDoubleClick = useCallback(
    (routeId: string, segmentId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const p = toNorm(e as unknown as { clientX: number; clientY: number });
      const newNode: RouteNode = { id: uid("node"), position: p };
      dispatch({
        type: "route.insertNode",
        routeId,
        segmentId,
        node: newNode,
      });
      onSelectRoute(routeId);
      onSelectNode(newNode.id);
      onSelectSegment(null);
    },
    [toNorm, dispatch, onSelectRoute, onSelectNode, onSelectSegment],
  );

  /* ---------- Dynamic cursor ---------- */

  let svgCursor = "crosshair";
  if (interaction.type === "dragging_player") svgCursor = "grabbing";
  if (interaction.type === "dragging_node") svgCursor = "grabbing";
  if (interaction.type === "dragging_segment") svgCursor = "grabbing";

  /* ---------- Yard lines ---------- */

  const yardLines = [];
  for (let i = 1; i < 10; i++) {
    const y = i / 10;
    yardLines.push(
      <line key={`h${i}`} x1={0} y1={y} x2={1} y2={y} stroke={LINE_COLOR} strokeWidth={0.002} />,
    );
  }

  /* ---------- Determine which route is "active" (selected or being placed) ---------- */

  const activeRouteId = placingState?.routeId ?? selectedRouteId;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1 1"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none rounded-xl shadow-card"
      style={{ cursor: svgCursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishInteraction}
      onPointerLeave={finishInteraction}
    >
      <defs>
        <linearGradient id="fieldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={FIELD_BG} />
          <stop offset="100%" stopColor={FIELD_DARK} />
        </linearGradient>
      </defs>
      <rect width={1} height={1} fill="url(#fieldGrad)" />
      {yardLines}

      {/* Routes */}
      {doc.layers.routes.map((route) => {
        const isActive = route.id === activeRouteId;
        const rendered = routeToRenderedSegments(route);
        const nodeMap = new Map(route.nodes.map((n) => [n.id, n]));

        return (
          <g key={route.id}>
            {/* Segments */}
            {rendered.map((rs) => {
              const seg = route.segments.find((s) => s.id === rs.segmentId);
              const isSelectedSeg = rs.segmentId === selectedSegmentId && isActive;
              return (
                <g key={rs.segmentId}>
                  {/* Invisible wider hit area */}
                  <path
                    d={rs.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={0.025}
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
                      handleDoubleClick(route.id, rs.segmentId, e)
                    }
                  />
                  {/* Visible path */}
                  <path
                    d={rs.d}
                    fill="none"
                    stroke={isSelectedSeg ? "#F26522" : route.style.stroke}
                    strokeWidth={isSelectedSeg ? 0.006 : route.style.strokeWidth * 0.002}
                    strokeDasharray={rs.dash}
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                </g>
              );
            })}

            {/* Nodes (only shown when route is active/selected) */}
            {isActive &&
              route.nodes.map((node) => {
                const isSelectedNode = node.id === selectedNodeId;
                const svgY = 1 - node.position.y;
                return (
                  <circle
                    key={node.id}
                    cx={node.position.x}
                    cy={svgY}
                    r={NODE_RADIUS}
                    fill={isSelectedNode ? "#F26522" : "#FFFFFF"}
                    stroke={isSelectedNode ? "#F26522" : "rgba(0,0,0,0.5)"}
                    strokeWidth={0.002}
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

      {/* Placing preview line: from last node to cursor */}
      {placingState?.cursorPos && (() => {
        const route = doc.layers.routes.find((r) => r.id === placingState.routeId);
        const lastNode = route?.nodes.find((n) => n.id === placingState.lastNodeId);
        if (!lastNode) return null;
        const fx = lastNode.position.x;
        const fy = 1 - lastNode.position.y;
        const tx = placingState.cursorPos.x;
        const ty = 1 - placingState.cursorPos.y;
        return (
          <line
            x1={fx}
            y1={fy}
            x2={tx}
            y2={ty}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={0.003}
            strokeDasharray="0.008 0.005"
            pointerEvents="none"
          />
        );
      })()}

      {/* Players */}
      {doc.layers.players.map((pl) => {
        const sel = pl.id === selectedPlayerId;
        const isDragging =
          interaction.type === "dragging_player" && interaction.playerId === pl.id;
        return (
          <g key={pl.id}>
            {sel && (
              <circle
                cx={pl.position.x}
                cy={1 - pl.position.y}
                r={0.038}
                fill="none"
                stroke="#F26522"
                strokeWidth={0.003}
                opacity={0.5}
                pointerEvents="none"
              />
            )}
            <circle
              cx={pl.position.x}
              cy={1 - pl.position.y}
              r={0.028}
              fill={sel ? "#F26522" : "#FFFFFF"}
              stroke={sel ? "#F26522" : "rgba(0,0,0,0.3)"}
              strokeWidth={sel ? 0.004 : 0.003}
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                // If placing, finish first
                if (placingState) {
                  finishPlacing();
                }
                startInteraction(e, { kind: "player", playerId: pl.id });
              }}
            />
            <text
              x={pl.position.x}
              y={1 - pl.position.y + 0.01}
              textAnchor="middle"
              fontSize={0.024}
              fontWeight={700}
              fill={sel ? "#FFFFFF" : "#1C1C1E"}
              pointerEvents="none"
              style={{ fontFamily: "Inter, system-ui, sans-serif" }}
            >
              {pl.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
