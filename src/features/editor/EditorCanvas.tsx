"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { PlayCommand } from "@/domain/play/commands";
import type { Player, Point2, Route } from "@/domain/play/types";
import { pathGeometryToSvgD, polylineToSegments, simplifyPolyline } from "@/domain/play/geometry";
import { uid } from "@/domain/play/factory";

export type Tool = "select" | "sketch" | "polyline";

export type EditorCanvasHandle = {
  commitPolyline: () => void;
};

type Props = {
  doc: import("@/domain/play/types").PlayDocument;
  dispatch: (c: PlayCommand) => void;
  tool: Tool;
  selectedPlayerId: string | null;
  selectedRouteId: string | null;
  onSelectPlayer: (id: string | null) => void;
  onSelectRoute: (id: string | null) => void;
  onPolylineDraftChange?: (pointCount: number) => void;
};

const FIELD = { w: 1, h: 1 };

export const EditorCanvas = forwardRef<EditorCanvasHandle, Props>(function EditorCanvas(
  {
    doc,
    dispatch,
    tool,
    selectedPlayerId,
    selectedRouteId,
    onSelectPlayer,
    onSelectRoute,
    onPolylineDraftChange,
  },
  ref,
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [polyPoints, setPolyPoints] = useState<Point2[]>([]);
  const [sketchPoints, setSketchPoints] = useState<Point2[]>([]);
  const draggingPlayer = useRef<string | null>(null);

  useEffect(() => {
    onPolylineDraftChange?.(polyPoints.length);
  }, [polyPoints, onPolylineDraftChange]);

  const toNorm = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2 => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }, []);

  const commitPolyline = useCallback(() => {
    if (polyPoints.length < 2) {
      setPolyPoints([]);
      return;
    }
    const carrier = selectedPlayerId ?? doc.layers.players[0]?.id;
    if (!carrier) return;
    const geometry = { segments: polylineToSegments(polyPoints, "clicked") };
    const route: Route = {
      id: uid("route"),
      carrierPlayerId: carrier,
      semantic: null,
      geometry,
      style: { stroke: "#7c3aed", strokeWidth: 2.2, dash: "4 3" },
    };
    dispatch({ type: "route.add", route });
    setPolyPoints([]);
  }, [dispatch, doc.layers.players, polyPoints, selectedPlayerId]);

  useImperativeHandle(ref, () => ({ commitPolyline }), [commitPolyline]);

  const handleDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = toNorm(e);
    if (tool === "select") {
      onSelectRoute(null);
      return;
    }
    if (tool === "sketch") {
      setSketchPoints([p]);
      return;
    }
    if (tool === "polyline") {
      setPolyPoints((prev) => [...prev, p]);
    }
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== "sketch" || sketchPoints.length === 0) return;
    const p = toNorm(e);
    setSketchPoints((prev) => [...prev, p]);
  };

  const handleUp = () => {
    if (tool !== "sketch" || sketchPoints.length < 2) return;
    const simplified = simplifyPolyline(sketchPoints, 0.008);
    setSketchPoints([]);
    const carrier =
      selectedPlayerId ??
      doc.layers.players.find((x) => x.role === "WR")?.id ??
      doc.layers.players[0]?.id;
    if (!carrier) return;
    const geometry = { segments: polylineToSegments(simplified, "freehand_simplified") };
    const route: Route = {
      id: uid("route"),
      carrierPlayerId: carrier,
      semantic: null,
      geometry,
      style: { stroke: "#2563eb", strokeWidth: 2.5 },
    };
    dispatch({ type: "route.add", route });
  };

  const onPlayerPointerDown = (e: React.MouseEvent, pl: Player) => {
    e.stopPropagation();
    if (tool !== "select") return;
    draggingPlayer.current = pl.id;
    onSelectPlayer(pl.id);
    onSelectRoute(null);
  };

  const onPointerMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggingPlayer.current || tool !== "select") return;
    const p = toNorm(e);
    dispatch({ type: "player.move", playerId: draggingPlayer.current, position: p });
  };

  const onPointerUp = () => {
    draggingPlayer.current = null;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${FIELD.w} ${FIELD.h}`}
      preserveAspectRatio="xMidYMin meet"
      className="h-full w-full cursor-crosshair touch-none rounded-xl bg-pg-field/90 ring-1 ring-pg-line/80"
      onMouseDown={handleDown}
      onMouseMove={(e) => {
        handleMove(e);
        onPointerMove(e);
      }}
      onMouseUp={() => {
        handleUp();
        onPointerUp();
      }}
      onMouseLeave={() => {
        handleUp();
        onPointerUp();
      }}
      onDoubleClick={(e) => {
        if (tool === "polyline") {
          e.preventDefault();
          commitPolyline();
        }
      }}
    >
      <rect width={FIELD.w} height={FIELD.h} fill="#ecfdf5" stroke="#94a3b8" strokeWidth={0.004} />
      {doc.layers.routes.map((r) => {
        const d = pathGeometryToSvgD(r.geometry);
        const selected = r.id === selectedRouteId;
        return (
          <path
            key={r.id}
            d={d}
            fill="none"
            stroke={selected ? "#ea580c" : r.style.stroke}
            strokeWidth={selected ? 0.006 : r.style.strokeWidth * 0.002}
            strokeDasharray={r.style.dash}
            vectorEffect="non-scaling-stroke"
            onMouseDown={(e) => {
              e.stopPropagation();
              if (tool === "select") {
                onSelectRoute(r.id);
                onSelectPlayer(null);
              }
            }}
          />
        );
      })}
      {polyPoints.length > 0 && (
        <path
          d={pathGeometryToSvgD({ segments: polylineToSegments(polyPoints, "clicked") })}
          fill="none"
          stroke="#64748b"
          strokeWidth={0.004}
          strokeDasharray="2 2"
        />
      )}
      {sketchPoints.length > 1 && (
        <path
          d={pathGeometryToSvgD({
            segments: polylineToSegments(sketchPoints, "freehand_simplified"),
          })}
          fill="none"
          stroke="#2563eb"
          strokeWidth={0.003}
          opacity={0.5}
        />
      )}
      {doc.layers.players.map((pl) => {
        const sel = pl.id === selectedPlayerId;
        return (
          <g key={pl.id}>
            <circle
              cx={pl.position.x}
              cy={1 - pl.position.y}
              r={0.028}
              fill={pl.style.fill}
              stroke={sel ? "#ea580c" : pl.style.stroke}
              strokeWidth={sel ? 0.005 : 0.003}
              onMouseDown={(e) => onPlayerPointerDown(e, pl)}
            />
            <text
              x={pl.position.x}
              y={1 - pl.position.y + 0.01}
              textAnchor="middle"
              fontSize={0.028}
              fill={pl.style.labelColor}
              pointerEvents="none"
              style={{ fontFamily: "system-ui" }}
            >
              {pl.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
});
