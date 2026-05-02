"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayForEditorAction } from "@/app/actions/plays";
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
import { resolveFieldTheme } from "@/domain/play/fieldTheme";
import { fieldAspectFor, NARROW_FIELD_ASPECT } from "@/domain/play/render-config";
import { coachDiagramToPlayDocument, type CoachDiagram } from "./coachDiagramConverter";

// ── Player token shape ───────────────────────────────────────────────────────

function PlayerToken({ player, cx, cy, r }: {
  player: Player; cx: number; cy: number; r: number;
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

  // Pure translate — no scale correction. The SVG viewBox now uses the
  // field's natural aspect ratio (matching the editor), so a circle in
  // viewBox space renders as a real circle in CSS pixels. The previous
  // sxCorr existed to compensate for an auto-zoomed viewBox forced into
  // 16:10 — that distortion is gone.
  return (
    <g transform={`translate(${cx} ${cy})`}>
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

function RouteDecorations({ doc, fieldAspect }: {
  doc: PlayDocument; fieldAspect: number;
}) {
  // All x coordinates are scaled by fieldAspect to match the new viewBox
  // (matches editor's `fx` transform). Y is unchanged (still in [0, 1]).
  const fx = (x: number) => x * fieldAspect;
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
          const tipX = fx(toNode.position.x);
          const tipY = 1 - toNode.position.y;
          const fromX = fx(dirFromX), fromY = 1 - dirFromY;
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

function DiagramCanvas({ doc, animPositions, fullFieldWidth }: {
  doc: PlayDocument;
  animPositions: Map<string, Point2> | null;
  fullFieldWidth: boolean;
}) {
  // Full-field aspect ratio matching the editor + game-mode renderers.
  // Replaces the previous auto-zoom-to-content viewBox that distorted
  // proportions and produced the "stretched" look a coach surfaced
  // 2026-05-01.
  //
  // Clamping mirrors PlayEditorClient's "full field width" toggle: when
  // OFF (default), wide variants like tackle_11 cap at NARROW_FIELD_ASPECT
  // (≈ flag_7v7's 1.6:1) so the chat panel doesn't render a 2.83:1 strip
  // that compresses the OL row. When ON, the field renders at its
  // natural variant aspect (sideline-to-sideline). User-controlled via
  // the Controls checkbox below.
  const fieldAspect = useMemo(() => {
    const natural = fieldAspectFor(doc);
    return fullFieldWidth ? natural : Math.min(natural, NARROW_FIELD_ASPECT);
  }, [doc, fullFieldWidth]);
  const fx = (x: number) => x * fieldAspect; // mirrors EditorCanvas's fx
  const R  = 0.032;

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
        <line key={`h${yd}`} x1={0} y1={svgY} x2={fieldAspect} y2={svgY}
          stroke={theme.lineColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />,
      );
    }
    const label = yardLabel(yd);
    if (label && showYardNumbers) {
      const numY = svgY + 0.018;
      yardNumbers.push(
        <text key={`nL${yd}`} x={fx(0.27)} y={numY} fontSize={0.04} fontWeight={700}
          fill={theme.numberColor} textAnchor="middle" pointerEvents="none">
          {label}
        </text>,
        <text key={`nR${yd}`} x={fx(0.73)} y={numY} fontSize={0.04} fontWeight={700}
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
    const hashLeftX  = fx(hashLeftFrac);
    const hashRightX = fx(hashRightFrac);
    for (let i = 1; i < N_TICKS; i++) {
      const y = i / N_TICKS;
      hashMarks.push(
        <line key={`hml${i}`} x1={hashLeftX} y1={y - TICK_HALF}
          x2={hashLeftX} y2={y + TICK_HALF}
          stroke={theme.hashColor} strokeWidth={2.25} strokeLinecap="round"
          vectorEffect="non-scaling-stroke" />,
        <line key={`hmr${i}`} x1={hashRightX} y1={y - TICK_HALF}
          x2={hashRightX} y2={y + TICK_HALF}
          stroke={theme.hashColor} strokeWidth={2.25} strokeLinecap="round"
          vectorEffect="non-scaling-stroke" />,
      );
    }
  }

  const animatingIds = new Set(animPositions?.keys() ?? []);

  return (
    <div
      className="w-full max-w-[640px] overflow-hidden rounded-xl border border-border"
      // Dynamic aspect ratio matching the field's natural proportions.
      // tackle_11 → ~2.83:1, flag_7v7 → 1.6:1, flag_5v5 → 1.33:1.
      // Preserves the editor's framing (no auto-zoom distortion).
      style={{ aspectRatio: String(fieldAspect) }}
    >
      <svg
        viewBox={`0 0 ${fieldAspect} 1`}
        width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet"
        // Explicit color="black" so any SVG element that ever falls back
        // to currentColor (e.g. an unresolved fill="url(#…)") paints black
        // — never the parent's text color, which on the Coach Cal panel
        // can be the anchored playbook accent (red/orange on Chiefs Girls).
        color="#000"
      >
        {/* Field is a SOLID fill. The previous gradient (top→bottom green)
            had to be referenced via fill="url(#caiFieldGrad-…)", and a
            failed url ref or duplicate-id collision would let the rect
            fall back to currentColor — which on a tinted chat panel
            surfaced as an orange field. Solid fill removes the failure
            mode entirely; visually it's nearly identical to the gradient
            on a 16:10 viewport. */}
        <rect x={0} y={0} width={fieldAspect} height={1} fill={theme.bgMain} />
        {yardLines}
        {yardNumbers}
        {hashMarks}
        {/* Line of scrimmage — drawn on top of yard lines, dashed. */}
        <line x1={0} x2={fieldAspect} y1={losSvgY} y2={losSvgY}
          stroke={theme.losColor} strokeWidth={2} strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke" />

        {/* Zones (drawn under routes/players so markers stay legible) */}
        {(doc.layers.zones ?? []).map((z) => {
          const cx = fx(z.center.x);
          const cy = 1 - z.center.y;
          const w = z.size.w * fieldAspect * 2; // zone width is in normalized field units, scale x
          const h = z.size.h * 2;
          const labelY = cy - z.size.h + 0.028;
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
                <ellipse cx={cx} cy={cy} rx={z.size.w * fieldAspect} ry={z.size.h} {...common} />
              ) : (
                <rect x={cx - z.size.w * fieldAspect} y={cy - z.size.h} width={w} height={h} rx={0.012} ry={0.012} {...common} />
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

        {/* Routes (always static). Path d="" strings are emitted in
            normalized 0..1 coords by routeToRenderedSegments — wrap in a
            scale transform so x maps to viewBox-aspect space. y is left
            alone (still 0..1). Strokes use vector-effect=non-scaling so
            they render at constant pixel width regardless of the scale. */}
        <g transform={`scale(${fieldAspect} 1)`}>
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
        </g>

        {/* Route decorations (computed in viewBox-aspect space directly) */}
        <RouteDecorations doc={doc} fieldAspect={fieldAspect} />

        {/* Static players (hidden during animation if they have a route) */}
        {doc.layers.players.map((p) => {
          if (animPositions && animatingIds.has(p.id)) return null;
          return (
            <PlayerToken key={p.id} player={p}
              cx={fx(p.position.x)} cy={1 - p.position.y}
              r={R} />
          );
        })}

        {/* Animated player positions */}
        {animPositions && doc.layers.players.map((p) => {
          const pos = animPositions.get(p.id);
          if (!pos) return null;
          return (
            <PlayerToken key={`anim-${p.id}`} player={p}
              cx={fx(pos.x)} cy={1 - pos.y}
              r={R} />
          );
        })}
      </svg>
    </div>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

function Controls({ anim, fullFieldWidth, onToggleFullFieldWidth }: {
  anim: ReturnType<typeof usePlayAnimation>;
  fullFieldWidth: boolean;
  onToggleFullFieldWidth: (next: boolean) => void;
}) {
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
      {/* Full-field-width toggle. Mirrors the editor's same checkbox so a
          coach can scan the play with the OL row at usable size (default,
          off → ≈ 1.6:1) or expand to true sideline-to-sideline (on →
          variant's natural aspect, e.g. ~2.83:1 for tackle_11). State is
          per-message — each chat diagram has its own toggle. */}
      <label className="ml-auto mr-2 flex cursor-pointer select-none items-center gap-1 text-[11px] text-muted hover:text-foreground">
        <input
          type="checkbox"
          checked={fullFieldWidth}
          onChange={(e) => onToggleFullFieldWidth(e.target.checked)}
          className="size-3 cursor-pointer"
          aria-label="Show full field width"
        />
        <span>Full field width</span>
      </label>
      <div className="flex items-center gap-1 text-[11px] text-muted">
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
  // Forgive the common model slip of using ```play with a saved-play id payload
  // (the correct fence is ```play-ref). If the body is just `{"id": "..."}`
  // and has no players/diagram fields, route to the ref renderer instead of
  // crashing in the converter.
  const refId = useMemo(() => {
    if (!trimmed) return null;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (
        obj &&
        typeof obj.id === "string" &&
        obj.id.length > 0 &&
        obj.players === undefined &&
        obj.formation === undefined
      ) {
        return obj.id;
      }
    } catch {
      /* fall through to the diagram parser */
    }
    return null;
  }, [trimmed]);

  const parsed = useMemo<{ doc: PlayDocument | null; error: string | null }>(() => {
    if (!trimmed) return { doc: null, error: null };
    if (refId) return { doc: null, error: null };
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

  // Empty fence (mid-stream / model emitted ```play\n```) — render nothing.
  if (!trimmed) return null;

  // Saved-play id slipped into a ```play fence — render the ref instead.
  if (refId) return <PlayDiagramRef json={trimmed} />;

  // Failed to parse, but the JSON looks like it's still streaming in. Show a
  // quiet field-shaped placeholder instead of the angry yellow warning — the
  // diagram will replace it the moment the closing brace arrives.
  if (!doc && looksIncomplete(trimmed)) {
    return <DiagramSkeleton />;
  }

  // Non-empty, looks complete, but failed to parse — that's a real authoring
  // bug. Show the diagnostic so we can tell when the model emitted bad JSON.
  if (!doc) {
    return <DiagramFailureDetails error={parsed.error ?? "unknown parse error"} json={trimmed} />;
  }

  return <PlayDocRender doc={doc} />;
}

/** Render-from-doc primitive shared by PlayDiagramEmbed (model-supplied
 *  JSON) and PlayDiagramRef (saved play fetched by id). */
function PlayDocRender({ doc }: { doc: PlayDocument }) {
  const anim = usePlayAnimation(doc);
  const hasRoutes = doc.layers.routes.length > 0;
  const animPositions = anim.phase !== "idle" ? anim.playerPositions : null;
  // Per-message field-width toggle. Defaults OFF — matches the editor's
  // default of clamping wide variants (tackle_11, six-man) to roughly
  // the 7v7 aspect so the chat panel stays at a usable size on a
  // typical screen. Coach can opt in to the full sideline-to-sideline
  // view via the checkbox in Controls.
  const [fullFieldWidth, setFullFieldWidth] = useState<boolean>(false);
  return (
    <div className="my-3 space-y-1">
      {doc.metadata.formation && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {doc.metadata.formation}
        </p>
      )}
      <DiagramCanvas doc={doc} animPositions={animPositions} fullFieldWidth={fullFieldWidth} />
      {hasRoutes && (
        <Controls
          anim={anim}
          fullFieldWidth={fullFieldWidth}
          onToggleFullFieldWidth={setFullFieldWidth}
        />
      )}
    </div>
  );
}

/**
 * Failure box for diagram parse / render errors. Shows the error message
 * and (when available) the raw JSON payload, with a copy button on each
 * so the coach can paste the error into a bug report or share it with
 * support without screenshotting. Surfaced 2026-05-02 — coach reported
 * "I can't seem to copy this text out" when a Flood Right play hit an
 * overlap-resolver failure.
 */
function DiagramFailureDetails({ error, json }: { error: string; json?: string }) {
  const [copied, setCopied] = useState<"error" | "json" | "all" | null>(null);
  const copyToClipboard = async (text: string, kind: "error" | "json" | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore — clipboard may be unavailable in some embeds
    }
  };
  const both = json ? `${error}\n\n--- diagram JSON ---\n${json}` : error;
  return (
    <details className="my-2 rounded-lg border border-amber-300/50 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
      <summary className="cursor-pointer font-semibold">Diagram failed to render — tap for details</summary>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void copyToClipboard(both, "all")}
          className="rounded border border-amber-400/60 bg-amber-100/60 px-1.5 py-0.5 font-medium hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-900/40 dark:hover:bg-amber-900/60"
          title="Copy error message + diagram JSON"
        >
          {copied === "all" ? "Copied" : "Copy all"}
        </button>
        <button
          type="button"
          onClick={() => void copyToClipboard(error, "error")}
          className="rounded border border-amber-400/60 bg-amber-100/60 px-1.5 py-0.5 font-medium hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-900/40 dark:hover:bg-amber-900/60"
          title="Copy just the error message"
        >
          {copied === "error" ? "Copied" : "Copy error"}
        </button>
        {json ? (
          <button
            type="button"
            onClick={() => void copyToClipboard(json, "json")}
            className="rounded border border-amber-400/60 bg-amber-100/60 px-1.5 py-0.5 font-medium hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-900/40 dark:hover:bg-amber-900/60"
            title="Copy just the diagram JSON"
          >
            {copied === "json" ? "Copied" : "Copy JSON"}
          </button>
        ) : null}
      </div>
      <p className="mt-1 font-mono text-[11px] select-text">{error}</p>
      {json ? (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-amber-900/80 select-text dark:text-amber-200/80">{json}</pre>
      ) : null}
    </details>
  );
}

function DiagramSkeleton() {
  return (
    <div
      className="my-3 aspect-[16/10] w-full max-w-[640px] animate-pulse overflow-hidden rounded-xl border border-border"
      style={{ backgroundColor: "#2D8B4E" }}
      aria-label="Loading play diagram"
    />
  );
}

/** Render an existing saved play by id. Fetches the document fresh —
 *  the model never transmits coordinates, so it can't paraphrase them.
 *  Used for the ```play-ref fence type. */
export function PlayDiagramRef({ json }: { json: string }) {
  const id = useMemo(() => {
    const trimmed = json.trim();
    if (!trimmed) return null;
    try {
      const obj = JSON.parse(trimmed) as { id?: unknown };
      return typeof obj.id === "string" && obj.id.length > 0 ? obj.id : null;
    } catch {
      return null;
    }
  }, [json]);

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; doc: PlayDocument }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (!id) {
      setState({ kind: "error", message: "play-ref fence is missing an id" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    getPlayForEditorAction(id).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setState({ kind: "error", message: res.error });
        return;
      }
      setState({ kind: "ok", doc: res.document });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === "loading") return <DiagramSkeleton />;
  if (state.kind === "error") {
    return <DiagramFailureDetails error={state.message} />;
  }
  return <PlayDocRender doc={state.doc} />;
}
