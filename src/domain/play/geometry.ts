import type { PathGeometry, Point2 } from "./types";

/** Douglas–Peucker simplification for freehand polylines */
export function simplifyPolyline(points: Point2[], epsilon: number): Point2[] {
  if (points.length <= 2) return points;

  function perpDistance(p: Point2, a: Point2, b: Point2) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    const proj = { x: a.x + clamped * dx, y: a.y + clamped * dy };
    return Math.hypot(p.x - proj.x, p.y - proj.y);
  }

  function recurse(pts: Point2[], start: number, end: number, out: Point2[]) {
    let maxDist = 0;
    let index = start;
    for (let i = start + 1; i < end; i++) {
      const d = perpDistance(pts[i], pts[start], pts[end]);
      if (d > maxDist) {
        index = i;
        maxDist = d;
      }
    }
    if (maxDist > epsilon) {
      recurse(pts, start, index, out);
      out.push(pts[index]);
      recurse(pts, index, end, out);
    }
  }

  const out: Point2[] = [points[0]];
  recurse(points, 0, points.length - 1, out);
  out.push(points[points.length - 1]);

  const dedup = out.filter(
    (p, i) => i === 0 || p.x !== out[i - 1].x || p.y !== out[i - 1].y,
  );
  return dedup;
}

export function polylineToSegments(
  points: Point2[],
  kind: import("./types").PathSegmentKind,
): PathGeometry["segments"] {
  if (points.length < 2) return [];
  const segments: PathGeometry["segments"] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      type: "line",
      from: points[i],
      to: points[i + 1],
      kind,
    });
  }
  return segments;
}

/** Field coords: y=0 at bottom, y=1 at top. SVG viewBox y grows downward. */
function toSvgY(fieldY: number) {
  return 1 - fieldY;
}

export function pathGeometryToSvgD(geometry: PathGeometry): string {
  const parts: string[] = [];
  for (const seg of geometry.segments) {
    if (seg.type === "line") {
      const fx = seg.from.x;
      const fy = toSvgY(seg.from.y);
      const tx = seg.to.x;
      const ty = toSvgY(seg.to.y);
      if (parts.length === 0) {
        parts.push(`M ${fx} ${fy}`);
      }
      parts.push(`L ${tx} ${ty}`);
    } else {
      const fx = seg.from.x;
      const fy = toSvgY(seg.from.y);
      const cx = seg.control.x;
      const cy = toSvgY(seg.control.y);
      const tx = seg.to.x;
      const ty = toSvgY(seg.to.y);
      if (parts.length === 0) {
        parts.push(`M ${fx} ${fy}`);
      }
      parts.push(`Q ${cx} ${cy} ${tx} ${ty}`);
    }
  }
  return parts.join(" ");
}
