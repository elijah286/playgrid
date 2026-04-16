"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { Player, Point2, Route, RouteNode, RouteSegment } from "@/domain/play/types";
import {
  routeToRenderedSegments,
  simplifyPolyline,
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
  | { type: "dragging_segment"; routeId: string; segmentId: string }
  /** User is drawing freehand from a selected player */
  | {
      type: "drawing_route";
      playerId: string;
      /** Points captured during drag (includes player position as first point) */
      points: Point2[];
    };

const DRAG_THRESHOLD_PX = 5;
const SIMPLIFY_EPSILON = 0.012;

/* ------------------------------------------------------------------ */
/*  Visual constants                                                  */
/* ------------------------------------------------------------------ */

const FIELD_BG = "#2D8B4E";
const FIELD_DARK = "#247540";
const LINE_COLOR = "rgba(255,255,255,0.15)";
const NODE_RADIUS = 0.012;

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
  /** Active settings for the next route that will be drawn */
  activeShape: import("@/domain/play/types").SegmentShape;
  activeStrokePattern: import("@/domain/play/types").StrokePattern;
  activeColor: string;
  activeWidth: number;
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

  /* ---------- Active style builder ---------- */

  const buildRouteStyle = useCallback(
    () => ({ stroke: activeColor, strokeWidth: activeWidth }),
    [activeColor, activeWidth],
  );

  /* ---------- Create a route from a list of points (freehand release) ---------- */

  const commitFreehandRoute = useCallback(
    (playerId: string, rawPoints: Point2[]) => {
      // Need at least player pos + 1 more point
      if (rawPoints.length < 2) return;
      const simplified = simplifyPolyline(rawPoints, SIMPLIFY_EPSILON);
      if (simplified.length < 2) return;

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
      onSelectNode(null);
      onSelectSegment(null);
    },
    [dispatch, onSelectRoute, onSelectNode, onSelectSegment, activeShape, activeStrokePattern, buildRouteStyle],
  );

  /* ---------- Create a 2-node line route (single click) ---------- */

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
      onSelectNode(null);
      onSelectSegment(null);
    },
    [dispatch, onSelectRoute, onSelectNode, onSelectSegment, activeShape, activeStrokePattern, buildRouteStyle],
  );

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
      // Canvas click — always start as pending; intent (click vs drag) decided on move/up
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

        // Canvas drag + player selected → start freehand drawing from player pos
        if (state.target.kind === "canvas" && selectedPlayerId) {
          const player = doc.layers.players.find((p) => p.id === selectedPlayerId);
          if (!player) return;
          const next: Interaction = {
            type: "drawing_route",
            playerId: selectedPlayerId,
            points: [player.position, state.origin, toNorm(e)],
          };
          setInteraction(next);
          interactionRef.current = next;
          return;
        }
        // Canvas drag without player selection = just deselect on release
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
    [toNorm, dispatch, selectedPlayerId, doc.layers.players],
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
          // Canvas click (no drag)
          if (selectedPlayerId) {
            // Player was selected → create a 2-node line route
            const player = doc.layers.players.find((p) => p.id === selectedPlayerId);
            if (player) {
              commitClickRoute(selectedPlayerId, player.position, state.origin);
            }
          } else {
            // Nothing selected, nothing to create; deselect all
            onSelectPlayer(null);
            onSelectRoute(null);
            onSelectNode(null);
            onSelectSegment(null);
          }
        }
      }

      if (state.type === "drawing_route") {
        commitFreehandRoute(state.playerId, state.points);
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
    ],
  );

  /* ---------- Double-click: insert node on segment ---------- */

  const handleSegmentDoubleClick = useCallback(
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

  let svgCursor = selectedPlayerId ? "crosshair" : "default";
  if (interaction.type === "dragging_player") svgCursor = "grabbing";
  if (interaction.type === "dragging_node") svgCursor = "grabbing";
  if (interaction.type === "dragging_segment") svgCursor = "grabbing";
  if (interaction.type === "drawing_route") svgCursor = "crosshair";

  /* ---------- Yard lines ---------- */

  const yardLines = [];
  for (let i = 1; i < 10; i++) {
    const y = i / 10;
    yardLines.push(
      <line key={`h${i}`} x1={0} y1={y} x2={1} y2={y} stroke={LINE_COLOR} strokeWidth={0.002} />,
    );
  }

  /* ---------- Draft drawing path ---------- */

  const draftPath = (() => {
    if (interaction.type !== "drawing_route") return null;
    const pts = interaction.points;
    if (pts.length < 2) return null;
    const parts: string[] = [];
    pts.forEach((p, i) => {
      const x = p.x;
      const y = 1 - p.y;
      parts.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    });
    return parts.join(" ");
  })();

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
        const isActive = route.id === selectedRouteId;
        const rendered = routeToRenderedSegments(route);

        return (
          <g key={route.id}>
            {/* Segments */}
            {rendered.map((rs) => {
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
                      handleSegmentDoubleClick(route.id, rs.segmentId, e)
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

      {/* Draft freehand preview */}
      {draftPath && (
        <path
          d={draftPath}
          fill="none"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth={0.004}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}

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
