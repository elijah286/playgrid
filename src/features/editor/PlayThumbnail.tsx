import type { Player, Route, Zone } from "@/domain/play/types";
import { resolveEndDecoration, resolveRouteStroke } from "@/domain/play/factory";
import { routeToRenderedSegments } from "@/domain/play/geometry";

export type PlayThumbnailInput = {
  players: Player[];
  routes: Route[];
  zones?: Zone[];
  lineOfScrimmageY: number;
};

export type ThumbnailHighlightKind = "added" | "removed" | "modified";

export type ThumbnailHighlights = {
  players?: Map<string, ThumbnailHighlightKind>;
  routes?: Map<string, ThumbnailHighlightKind>;
  zones?: Map<string, ThumbnailHighlightKind>;
};

const HIGHLIGHT_COLOR: Record<ThumbnailHighlightKind, string> = {
  added: "rgba(34,197,94,0.85)",
  removed: "rgba(239,68,68,0.85)",
  modified: "rgba(245,158,11,0.85)",
};

export function PlayThumbnail({
  preview,
  thin,
  light,
  highlights,
}: {
  preview: PlayThumbnailInput;
  thin?: boolean;
  /**
   * Force a light background regardless of the user's theme. Used by
   * marketing surfaces (e.g. example-book tiles) where plays should
   * always read as printed playsheets.
   */
  light?: boolean;
  highlights?: ThumbnailHighlights;
}) {
  const routeSW = thin ? 0.9 : 1.8;
  const arrowSW = thin ? 0.5 : 0.8;
  const playerSW = thin ? 0.6 : 1;
  const zoneSW = thin ? 0.6 : 1;
  const losSW = thin ? 0.75 : 1.25;
  const gridSW = thin ? 0.6 : 1;
  const tSW = thin ? 1 : 1.8;
  const R = 0.032;
  const PAD = R * 1.4;
  let minX = Infinity;
  let maxX = -Infinity;
  let minSvgY = Infinity;
  let maxSvgY = -Infinity;
  for (const p of preview.players) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    const sy = 1 - p.position.y;
    if (sy < minSvgY) minSvgY = sy;
    if (sy > maxSvgY) maxSvgY = sy;
  }
  for (const r of preview.routes) {
    for (const n of r.nodes) {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.x > maxX) maxX = n.position.x;
      const sy = 1 - n.position.y;
      if (sy < minSvgY) minSvgY = sy;
      if (sy > maxSvgY) maxSvgY = sy;
    }
    for (const seg of r.segments) {
      if (seg.shape === "curve" && seg.controlOffset) {
        if (seg.controlOffset.x < minX) minX = seg.controlOffset.x;
        if (seg.controlOffset.x > maxX) maxX = seg.controlOffset.x;
        const sy = 1 - seg.controlOffset.y;
        if (sy < minSvgY) minSvgY = sy;
        if (sy > maxSvgY) maxSvgY = sy;
      }
    }
  }
  if (!isFinite(minSvgY) || !isFinite(maxSvgY) || !isFinite(minX) || !isFinite(maxX)) {
    minX = 0;
    maxX = 1;
    minSvgY = 0.22;
    maxSvgY = 0.78;
  }
  const losSvgY = 1 - preview.lineOfScrimmageY;
  const tenSvgY = 1 - (preview.lineOfScrimmageY + 0.4);
  minSvgY = Math.min(minSvgY, tenSvgY);
  maxSvgY = Math.max(maxSvgY, losSvgY);

  let vbX = Math.max(0, minX - PAD);
  let vbW = Math.min(1, maxX + PAD) - vbX;
  let vbY = Math.max(0, minSvgY - PAD);
  let vbH = Math.min(1, maxSvgY + PAD) - vbY;

  const TARGET = 16 / 10;
  const currentAspect = vbW / vbH;
  if (currentAspect < TARGET) {
    const needed = vbH * TARGET;
    const extra = needed - vbW;
    vbX = Math.max(0, vbX - extra / 2);
    vbW = Math.min(1 - vbX, needed);
  } else if (currentAspect > TARGET) {
    const needed = vbW / TARGET;
    const extra = needed - vbH;
    vbY = Math.max(0, vbY - extra / 2);
    vbH = Math.min(1 - vbY, needed);
  }

  const aspect = vbW / vbH;
  const sxCorr = aspect / TARGET;
  const losY = 1 - preview.lineOfScrimmageY;
  const fiveY = 1 - (preview.lineOfScrimmageY + 0.2);
  const tenY = 1 - (preview.lineOfScrimmageY + 0.4);

  return (
    <div
      className={`aspect-[16/10] w-full overflow-hidden rounded-lg border ${light ? "border-slate-200 bg-white" : "border-border bg-surface-inset"}`}
    >
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        <g>
          <line x1={vbX} x2={vbX + vbW} y1={losY} y2={losY} stroke="rgba(100,116,139,0.45)" strokeWidth={losSW} vectorEffect="non-scaling-stroke" />
          <line x1={vbX} x2={vbX + vbW} y1={fiveY} y2={fiveY} stroke="rgba(100,116,139,0.3)" strokeWidth={gridSW} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          <line x1={vbX} x2={vbX + vbW} y1={tenY} y2={tenY} stroke="rgba(100,116,139,0.3)" strokeWidth={gridSW} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          {(preview.zones ?? []).map((z) => {
            const cx = z.center.x;
            const cy = 1 - z.center.y;
            const w = z.size.w;
            const h = z.size.h;
            const hl = highlights?.zones?.get(z.id);
            const haloColor = hl ? HIGHLIGHT_COLOR[hl] : null;
            if (z.kind === "rectangle") {
              return (
                <g key={z.id}>
                  {haloColor && (
                    <rect x={cx - w} y={cy - h} width={w * 2} height={h * 2} fill="none" stroke={haloColor} strokeWidth={zoneSW * 4} vectorEffect="non-scaling-stroke" />
                  )}
                  <rect x={cx - w} y={cy - h} width={w * 2} height={h * 2} fill={z.style.fill} stroke={z.style.stroke} strokeWidth={zoneSW} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                </g>
              );
            }
            return (
              <g key={z.id}>
                {haloColor && (
                  <ellipse cx={cx} cy={cy} rx={w} ry={h} fill="none" stroke={haloColor} strokeWidth={zoneSW * 4} vectorEffect="non-scaling-stroke" />
                )}
                <ellipse cx={cx} cy={cy} rx={w} ry={h} fill={z.style.fill} stroke={z.style.stroke} strokeWidth={zoneSW} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {preview.routes.map((r) => {
            const rendered = routeToRenderedSegments(r);
            const stroke = resolveRouteStroke(r, preview.players);
            const hl = highlights?.routes?.get(r.id);
            const haloColor = hl ? HIGHLIGHT_COLOR[hl] : null;
            return (
              <g key={r.id}>
                {haloColor && rendered.map((rs) => (
                  <path key={`halo-${rs.segmentId}`} d={rs.d} fill="none" stroke={haloColor} strokeWidth={routeSW * 3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.7} />
                ))}
                {rendered.map((rs) => (
                  <path key={rs.segmentId} d={rs.d} fill="none" stroke={stroke} strokeWidth={routeSW} strokeDasharray={rs.dash} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            );
          })}
          {preview.routes.map((r) => {
            const decoration = resolveEndDecoration(r);
            if (decoration === "none") return null;
            const fromIds = new Set(r.segments.map((s) => s.fromNodeId));
            const terminals = r.segments.filter((s) => !fromIds.has(s.toNodeId));
            const stroke = resolveRouteStroke(r, preview.players);
            return (
              <g key={`deco-${r.id}`}>
                {terminals.map((seg) => {
                  const fromNode = r.nodes.find((n) => n.id === seg.fromNodeId);
                  const toNode = r.nodes.find((n) => n.id === seg.toNodeId);
                  if (!fromNode || !toNode) return null;
                  const dirFromX = seg.shape === "curve" && seg.controlOffset ? seg.controlOffset.x : fromNode.position.x;
                  const dirFromY = seg.shape === "curve" && seg.controlOffset ? seg.controlOffset.y : fromNode.position.y;
                  const tipX = toNode.position.x;
                  const tipY = 1 - toNode.position.y;
                  const fromX = dirFromX;
                  const fromY = 1 - dirFromY;
                  const dxS = tipX - fromX;
                  const dyS = tipY - fromY;
                  const len = Math.hypot(dxS, dyS);
                  if (len < 1e-4) return null;
                  const ux = dxS / len;
                  const uy = dyS / len;
                  if (decoration === "arrow") {
                    const arrowLen = 0.05;
                    const cosA = Math.cos(Math.PI / 6);
                    const sinA = Math.sin(Math.PI / 6);
                    const bx = -ux;
                    const by = -uy;
                    const r1x = cosA * bx - sinA * by;
                    const r1y = sinA * bx + cosA * by;
                    const r2x = cosA * bx + sinA * by;
                    const r2y = -sinA * bx + cosA * by;
                    const p1x = tipX + arrowLen * r1x;
                    const p1y = tipY + arrowLen * r1y;
                    const p2x = tipX + arrowLen * r2x;
                    const p2y = tipY + arrowLen * r2y;
                    return (
                      <polygon key={seg.id} points={`${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`} fill={stroke} stroke={stroke} strokeWidth={arrowSW} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    );
                  }
                  if (decoration === "t") {
                    const halfLen = 0.028;
                    const perpX = -uy;
                    const perpY = ux;
                    return (
                      <line key={seg.id} x1={tipX + perpX * halfLen} y1={tipY + perpY * halfLen} x2={tipX - perpX * halfLen} y2={tipY - perpY * halfLen} stroke={stroke} strokeWidth={tSW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    );
                  }
                  return null;
                })}
              </g>
            );
          })}
          {preview.players.map((p) => {
            const cx = p.position.x;
            const cy = 1 - p.position.y;
            const shape = p.shape ?? "circle";
            const fill = p.style.fill;
            const strokeColor = p.style.stroke;
            const common = { fill, stroke: strokeColor, strokeWidth: playerSW, vectorEffect: "non-scaling-stroke" as const };
            let shapeEl: React.ReactNode;
            if (shape === "square") {
              shapeEl = <rect x={-R} y={-R} width={R * 2} height={R * 2} {...common} />;
            } else if (shape === "diamond") {
              shapeEl = <polygon points={`0,${-R} ${R},0 0,${R} ${-R},0`} {...common} />;
            } else if (shape === "triangle") {
              shapeEl = <polygon points={`0,${-R} ${R},${R} ${-R},${R}`} {...common} />;
            } else if (shape === "star") {
              const outer = R * 1.15;
              const inner = outer * 0.45;
              const pts = Array.from({ length: 10 }, (_, i) => {
                const angle = -Math.PI / 2 + (i * Math.PI) / 5;
                const rad = i % 2 === 0 ? outer : inner;
                return `${rad * Math.cos(angle)},${rad * Math.sin(angle)}`;
              }).join(" ");
              shapeEl = <polygon points={pts} strokeLinejoin="round" {...common} />;
            } else {
              shapeEl = <circle cx={0} cy={0} r={R} {...common} />;
            }
            const hl = highlights?.players?.get(p.id);
            const haloColor = hl ? HIGHLIGHT_COLOR[hl] : null;
            return (
              <g key={p.id} transform={`translate(${cx} ${cy}) scale(${sxCorr} 1)`}>
                {haloColor && (
                  <circle
                    cx={0}
                    cy={0}
                    r={R * 1.9}
                    fill="none"
                    stroke={haloColor}
                    strokeWidth={playerSW * 4}
                    strokeDasharray="3 2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {shapeEl}
                <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={0.035} fontWeight={700} fill={p.style.labelColor} style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                  {p.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
