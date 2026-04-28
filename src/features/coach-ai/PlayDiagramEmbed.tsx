"use client";

import { useMemo } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import type { PlayDocument, Player, Point2 } from "@/domain/play/types";
import {
  resolveEndDecoration,
  resolveRouteStroke,
  resolveShowHashMarks,
  resolveShowYardNumbers,
  resolveHashStyle,
  resolveFieldZone,
  hashColumnsForStyle,
} from "@/domain/play/factory";
import { routeToRenderedSegments } from "@/domain/play/geometry";
import { usePlayAnimation } from "@/features/animation/usePlayAnimation";
import { createEmptyPlayDocument } from "@/domain/play/factory";
import { resolveFieldTheme } from "@/domain/play/fieldTheme";
import { coachDiagramToPlayDocument, type CoachDiagram } from "./coachDiagramConverter";

// ── ViewBox computation (matches PlayThumbnail auto-zoom logic) ──────────────

type ViewBox = { x: number; y: number; w: number; h: number };

function computeViewBox(doc: PlayDocument): ViewBox {
  const R = 0.032;
  const PAD = R * 1.4;
  let minX = Infinity, maxX = -Infinity;
  let minSvgY = Infinity, maxSvgY = -Infinity;

  for (const p of doc.layers.players) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    const sy = 1 - p.position.y;
    if (sy < minSvgY) minSvgY = sy;
    if (sy > maxSvgY) maxSvgY = sy;
  }
  for (const r of doc.layers.routes) {
    for (const n of r.nodes) {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.x > maxX) maxX = n.position.x;
      const sy = 1 - n.position.y;
      if (sy < minSvgY) minSvgY = sy;
      if (sy > maxSvgY) maxSvgY = sy;
    }
  }
  for (const z of doc.layers.zones ?? []) {
    const left = z.center.x - z.size.w;
    const right = z.center.x + z.size.w;
    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    const top = 1 - (z.center.y + z.size.h);
    const bot = 1 - (z.center.y - z.size.h);
    if (top < minSvgY) minSvgY = top;
    if (bot > maxSvgY) maxSvgY = bot;
  }
  if (!isFinite(minSvgY)) { minX = 0; maxX = 1; minSvgY = 0.22; maxSvgY = 0.78; }

  const losY = 1 - (doc.lineOfScrimmageY ?? 0.4);
  const tenY = 1 - ((doc.lineOfScrimmageY ?? 0.4) + 0.4);
  minSvgY = Math.min(minSvgY, tenY);
  maxSvgY = Math.max(maxSvgY, losY);

  let vbX = Math.max(0, minX - PAD);
  let vbW = Math.min(1, maxX + PAD) - vbX;
  let vbY = Math.max(0, minSvgY - PAD);
  let vbH = Math.min(1, maxSvgY + PAD) - vbY;

  const TARGET = 16 / 10;
  const cur = vbW / vbH;
  if (cur < TARGET) {
    const needed = vbH * TARGET;
    vbX = Math.max(0, vbX - (needed - vbW) / 2);
    vbW = Math.min(1 - vbX, needed);
  } else if (cur > TARGET) {
    const needed = vbW / TARGET;
    vbY = Math.max(0, vbY - (needed - vbH) / 2);
    vbH = Math.min(1 - vbY, needed);
  }
  return { x: vbX, y: vbY, w: vbW, h: vbH };
}

// ── Player token shape ───────────────────────────────────────────────────────

function PlayerToken({ player, cx, cy, r, sxCorr }: {
  player: Player; cx: number; cy: number; r: number; sxCorr: number;
}) {
  const fill   = player.style.fill;
  const stroke = player.style.stroke;
  const shape  = player.shape ?? "circle";
  const common = { fill, stroke, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };

  // Triangles need a larger bounding box than circles to fit a 2-char label.
  // The visual "weight" of an upright triangle is concentrated at the top,
  // so we grow it ~30% and shift the label up into the wide part of the shape.
  const isTriangle = shape === "triangle";
  const tr = isTriangle ? r * 1.3 : r;
  const labelY = isTriangle ? -tr * 0.25 : 0;
  const labelFont = isTriangle ? 0.026 : 0.035;

  let shapeEl: React.ReactNode;
  if (shape === "square") {
    shapeEl = <rect x={-r} y={-r} width={r * 2} height={r * 2} {...common} />;
  } else if (shape === "diamond") {
    shapeEl = <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} {...common} />;
  } else if (isTriangle) {
    // Defender triangle. The play diagram puts offense at the BOTTOM of the
    // SVG and defense at the TOP, so we point the apex DOWN (toward the
    // offense / play) — base across the top, tip aimed at the line of
    // scrimmage.
    shapeEl = <polygon points={`${-tr},${-tr} ${tr},${-tr} 0,${tr}`} {...common} />;
  } else {
    shapeEl = <circle cx={0} cy={0} r={r} {...common} />;
  }

  return (
    <g transform={`translate(${cx} ${cy}) scale(${sxCorr} 1)`}>
      {shapeEl}
      <text x={0} y={labelY} textAnchor="middle" dominantBaseline="central"
        fontSize={labelFont} fontWeight={700} fill={player.style.labelColor}
        stroke={isTriangle ? "rgba(0,0,0,0.55)" : undefined}
        strokeWidth={isTriangle ? 1.2 : undefined}
        paintOrder={isTriangle ? "stroke" : undefined}
        vectorEffect={isTriangle ? "non-scaling-stroke" : undefined}
        style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {player.label}
      </text>
    </g>
  );
}

// ── Route end decoration (arrow / T) ─────────────────────────────────────────

function RouteDecorations({ doc, stroke, R: _R }: { doc: PlayDocument; stroke: string; R: number }) {
  return (
    <>
      {doc.layers.routes.map((r) => {
        const decoration = resolveEndDecoration(r);
        if (decoration === "none") return null;
        const fromIds = new Set(r.segments.map((s) => s.fromNodeId));
        const terminals = r.segments.filter((s) => !fromIds.has(s.toNodeId));
        const routeStroke = resolveRouteStroke(r, doc.layers.players);
        return terminals.map((seg) => {
          const fromNode = r.nodes.find((n) => n.id === seg.fromNodeId);
          const toNode   = r.nodes.find((n) => n.id === seg.toNodeId);
          if (!fromNode || !toNode) return null;
          const dirFromX = seg.shape === "curve" && seg.controlOffset ? seg.controlOffset.x : fromNode.position.x;
          const dirFromY = seg.shape === "curve" && seg.controlOffset ? seg.controlOffset.y : fromNode.position.y;
          const tipX = toNode.position.x;
          const tipY = 1 - toNode.position.y;
          const fromX = dirFromX, fromY = 1 - dirFromY;
          const dx = tipX - fromX, dy = tipY - fromY;
          const len = Math.hypot(dx, dy);
          if (len < 1e-4) return null;
          const ux = dx / len, uy = dy / len;
          if (decoration === "arrow") {
            const aLen = 0.05;
            const cos = Math.cos(Math.PI / 6), sin = Math.sin(Math.PI / 6);
            const bx = -ux, by = -uy;
            const r1x = cos * bx - sin * by, r1y = sin * bx + cos * by;
            const r2x = cos * bx + sin * by, r2y = -sin * bx + cos * by;
            const p1x = tipX + aLen * r1x, p1y = tipY + aLen * r1y;
            const p2x = tipX + aLen * r2x, p2y = tipY + aLen * r2y;
            return (
              <polygon key={seg.id} points={`${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`}
                fill={routeStroke} stroke={routeStroke} strokeWidth={0.8}
                strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            );
          }
          if (decoration === "t") {
            const half = 0.028;
            const px = -uy, py = ux;
            return (
              <line key={seg.id}
                x1={tipX + px * half} y1={tipY + py * half}
                x2={tipX - px * half} y2={tipY - py * half}
                stroke={routeStroke} strokeWidth={1.8} strokeLinecap="round"
                vectorEffect="non-scaling-stroke" />
            );
          }
          return null;
        });
      })}
    </>
  );
}

// ── Main canvas ──────────────────────────────────────────────────────────────

function DiagramCanvas({ doc, animPositions }: {
  doc: PlayDocument;
  animPositions: Map<string, Point2> | null;
}) {
  const vb     = useMemo(() => computeViewBox(doc), [doc]);
  const aspect = vb.w / vb.h;
  const TARGET = 16 / 10;
  const sxCorr = aspect / TARGET;
  const R      = 0.032;

  // Field-chrome rendering — must mirror EditorCanvas so a coach sees the same
  // field treatment in chat as they do in the editor. The full chrome (yard
  // lines, yard numbers, hash marks) draws across x=0..1 of the unit-square
  // field; the auto-computed viewBox above clips to whatever portion of the
  // field actually contains content.
  const losY01 = doc.lineOfScrimmageY ?? 0.4;
  const losSvgY = 1 - losY01;
  const theme = resolveFieldTheme(undefined); // green default, matches editor default
  const fieldLengthYds = doc.sportProfile.fieldLengthYds || 25;
  const losYd = Math.round(losY01 * fieldLengthYds);
  const zone = resolveFieldZone(doc);
  const losYardValue = zone === "midfield" ? 50 : 20;
  const yardLabel = (yd: number): string => {
    const delta = yd - losYd;
    if (zone === "midfield") {
      const v = 50 - Math.abs(delta);
      if (v <= 0 || v % 5 !== 0) return "";
      return String(v);
    }
    const v = losYardValue - delta;
    if (v <= 0) return "G";
    if (v >= 50 || v % 5 !== 0) return "";
    return String(v);
  };
  const showYardNumbers = resolveShowYardNumbers(doc);
  const showHash = resolveShowHashMarks(doc);
  const [hashLeftFrac, hashRightFrac] = hashColumnsForStyle(resolveHashStyle(doc));
  const yardLines: React.ReactNode[] = [];
  const yardNumbers: React.ReactNode[] = [];
  const yardInterval = 5;
  const firstBelowLos = losYd - Math.floor(losYd / yardInterval) * yardInterval;
  for (let yd = firstBelowLos; yd < fieldLengthYds; yd += yardInterval) {
    if (yd <= 0) continue;
    const y = yd / fieldLengthYds;
    const svgY = 1 - y;
    if (yd !== losYd) {
      yardLines.push(
        <line key={`h${yd}`} x1={0} y1={svgY} x2={1} y2={svgY}
          stroke={theme.lineColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />,
      );
    }
    const label = yardLabel(yd);
    if (label && showYardNumbers) {
      const numY = svgY + 0.018;
      yardNumbers.push(
        <text key={`nL${yd}`} x={0.27} y={numY} fontSize={0.04} fontWeight={700}
          fill={theme.numberColor} textAnchor="middle" pointerEvents="none">
          {label}
        </text>,
        <text key={`nR${yd}`} x={0.73} y={numY} fontSize={0.04} fontWeight={700}
          fill={theme.numberColor} textAnchor="middle" pointerEvents="none">
          {label}
        </text>,
      );
    }
  }
  const hashMarks: React.ReactNode[] = [];
  if (showHash) {
    const TICK_HALF = 0.010;
    const N_TICKS = 20;
    for (let i = 1; i < N_TICKS; i++) {
      const y = i / N_TICKS;
      hashMarks.push(
        <line key={`hml${i}`} x1={hashLeftFrac} y1={y - TICK_HALF}
          x2={hashLeftFrac} y2={y + TICK_HALF}
          stroke={theme.hashColor} strokeWidth={2.25} strokeLinecap="round"
          vectorEffect="non-scaling-stroke" />,
        <line key={`hmr${i}`} x1={hashRightFrac} y1={y - TICK_HALF}
          x2={hashRightFrac} y2={y + TICK_HALF}
          stroke={theme.hashColor} strokeWidth={2.25} strokeLinecap="round"
          vectorEffect="non-scaling-stroke" />,
      );
    }
  }

  const animatingIds = new Set(animPositions?.keys() ?? []);

  return (
    <div className="aspect-[16/10] w-full max-w-[640px] overflow-hidden rounded-xl border border-border">
      <svg
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        width="100%" height="100%"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="caiFieldGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.bgMain} />
            <stop offset="100%" stopColor={theme.bgDark} />
          </linearGradient>
        </defs>
        {/* Field gradient — covers the full unit-square; viewBox clips it. */}
        <rect x={0} y={0} width={1} height={1} fill="url(#caiFieldGrad)" />
        {yardLines}
        {yardNumbers}
        {hashMarks}
        {/* Line of scrimmage — drawn on top of yard lines, dashed. */}
        <line x1={0} x2={1} y1={losSvgY} y2={losSvgY}
          stroke={theme.losColor} strokeWidth={2} strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke" />

        {/* Zones (drawn under routes/players so markers stay legible) */}
        {(doc.layers.zones ?? []).map((z) => {
          const cx = z.center.x;
          const cy = 1 - z.center.y;
          const w = z.size.w * 2;
          const h = z.size.h * 2;
          const labelY = cy - z.size.h + 0.028;
          // Hardcode fill="none" — coverage diagrams stack 6+ overlapping
          // zones, so any fill (even translucent) compounds into a dark
          // blob over the field. Outline-only is the only safe choice.
          const common = {
            fill: "none" as const,
            stroke: z.style.stroke,
            strokeWidth: 1.4,
            strokeDasharray: "6 4",
            vectorEffect: "non-scaling-stroke" as const,
          };
          return (
            <g key={z.id}>
              {z.kind === "ellipse" ? (
                <ellipse cx={cx} cy={cy} rx={z.size.w} ry={z.size.h} {...common} />
              ) : (
                <rect x={cx - z.size.w} y={cy - z.size.h} width={w} height={h} rx={0.012} ry={0.012} {...common} />
              )}
              {z.label && (
                <text
                  x={cx}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="hanging"
                  fontSize={0.024}
                  fontWeight={700}
                  fill="rgba(255,255,255,0.92)"
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth={1.2}
                  paintOrder="stroke"
                  vectorEffect="non-scaling-stroke"
                  style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                >
                  {z.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Routes (always static) */}
        {doc.layers.routes.map((r) => {
          const segs = routeToRenderedSegments(r);
          const stroke = resolveRouteStroke(r, doc.layers.players);
          return (
            <g key={r.id}>
              {segs.map((rs) => (
                <path key={rs.segmentId} d={rs.d} fill="none" stroke={stroke}
                  strokeWidth={1.8} strokeDasharray={rs.dash}
                  strokeLinejoin="round" strokeLinecap="round"
                  vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          );
        })}

        {/* Route decorations */}
        <RouteDecorations doc={doc} stroke="" R={R} />

        {/* Static players (hidden during animation if they have a route) */}
        {doc.layers.players.map((p) => {
          if (animPositions && animatingIds.has(p.id)) return null;
          return (
            <PlayerToken key={p.id} player={p}
              cx={p.position.x} cy={1 - p.position.y}
              r={R} sxCorr={sxCorr} />
          );
        })}

        {/* Animated player positions */}
        {animPositions && doc.layers.players.map((p) => {
          const pos = animPositions.get(p.id);
          if (!pos) return null;
          return (
            <PlayerToken key={`anim-${p.id}`} player={p}
              cx={pos.x} cy={1 - pos.y}
              r={R} sxCorr={sxCorr} />
          );
        })}
      </svg>
    </div>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

function Controls({ anim }: { anim: ReturnType<typeof usePlayAnimation> }) {
  const isPlaying = anim.phase === "motion" || anim.phase === "play";
  const isDone    = anim.phase === "done";

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => { if (isPlaying) anim.togglePause(); else anim.step(); }}
        className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {isPlaying && !anim.paused
          ? <><Pause className="size-3" /> Pause</>
          : <><Play  className="size-3" /> {isDone ? "Replay" : "Play"}</>
        }
      </button>
      {anim.phase !== "idle" && (
        <button
          type="button"
          onClick={() => anim.reset()}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted hover:bg-surface-inset hover:text-foreground transition-colors"
        >
          <RotateCcw className="size-3" />
        </button>
      )}
      <div className="ml-auto flex items-center gap-1 text-[11px] text-muted">
        <span>Speed:</span>
        {[0.5, 1, 2].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => anim.setSpeed(s)}
            className={`rounded px-1.5 py-0.5 transition-colors ${
              anim.speed === s
                ? "bg-primary/15 font-semibold text-primary"
                : "hover:bg-surface-inset"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

/**
 * Heuristic: is this JSON likely still streaming in (i.e., parse-failure is
 * expected, not an authoring bug)? We treat any of the following as "in-flight":
 *
 *   - It doesn't end with `}` (final closing brace not arrived yet).
 *   - The braces are unbalanced (more `{` than `}`).
 *   - It ends with a comma, colon, opening bracket, etc. (mid-token).
 *
 * String-aware brace counting (so `{` inside a JSON string doesn't count) keeps
 * us from incorrectly flagging completed JSON-with-quoted-braces as in-flight.
 */
function looksIncomplete(s: string): boolean {
  if (!s) return true;
  if (!s.endsWith("}")) return true;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
  }
  return depth !== 0;
}

export function PlayDiagramEmbed({ json }: { json: string }) {
  const trimmed = json.trim();
  const parsed = useMemo<{ doc: PlayDocument | null; error: string | null }>(() => {
    if (!trimmed) return { doc: null, error: null };
    try {
      const diagram = JSON.parse(trimmed) as CoachDiagram;
      const doc = coachDiagramToPlayDocument(diagram);
      return { doc, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Don't log mid-stream failures — they're expected as JSON arrives in chunks.
      if (typeof window !== "undefined" && !looksIncomplete(trimmed)) {
        console.warn("[PlayDiagramEmbed] failed to parse play JSON", err, trimmed.slice(0, 200));
      }
      return { doc: null, error: msg };
    }
  }, [trimmed]);

  const doc = parsed.doc;
  const anim = usePlayAnimation(doc ?? FALLBACK_DOC);

  // Empty fence (mid-stream / model emitted ```play\n```) — render nothing.
  if (!trimmed) return null;

  // Failed to parse, but the JSON looks like it's still streaming in. Show a
  // quiet field-shaped placeholder instead of the angry yellow warning — the
  // diagram will replace it the moment the closing brace arrives.
  if (!doc && looksIncomplete(trimmed)) {
    return (
      <div
        className="my-3 aspect-[16/10] w-full max-w-[640px] animate-pulse overflow-hidden rounded-xl border border-border"
        style={{ backgroundColor: "#2D8B4E" }}
        aria-label="Loading play diagram"
      />
    );
  }

  // Non-empty, looks complete, but failed to parse — that's a real authoring
  // bug. Show the diagnostic so we can tell when the model emitted bad JSON.
  if (!doc) {
    return (
      <details className="my-2 rounded-lg border border-amber-300/50 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
        <summary className="cursor-pointer font-semibold">Diagram failed to render — tap for details</summary>
        <p className="mt-1 font-mono text-[11px]">{parsed.error ?? "unknown parse error"}</p>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-amber-900/80 dark:text-amber-200/80">{trimmed}</pre>
      </details>
    );
  }

  const hasRoutes = doc.layers.routes.length > 0;
  const animPositions = anim.phase !== "idle" ? anim.playerPositions : null;

  return (
    <div className="my-3 space-y-1">
      {doc.metadata.formation && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {doc.metadata.formation}
        </p>
      )}
      <DiagramCanvas doc={doc} animPositions={animPositions} />
      {hasRoutes && <Controls anim={anim} />}
    </div>
  );
}

const FALLBACK_DOC: PlayDocument = createEmptyPlayDocument();
