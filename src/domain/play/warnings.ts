import type { PlayDocument } from "./types";

/** Rule hooks for motion / eligibility — v1 returns light warnings */
export function evaluateSportWarnings(doc: PlayDocument): string[] {
  const warnings: string[] = [];
  const motionRoutes = doc.layers.routes.filter((r) => r.motion);
  if (doc.sportProfile.motionMustNotAdvanceTowardGoal && motionRoutes.length > 0) {
    for (const r of motionRoutes) {
      const segs = r.geometry.segments;
      if (segs.length === 0) continue;
      const first = segs[0];
      const start = first.type === "line" ? first.from : first.from;
      const end = segs[segs.length - 1];
      const last = end.type === "line" ? end.to : end.to;
      if (last.y > start.y + 0.02) {
        warnings.push(
          "Motion route may advance toward the goal line — verify league rules at the snap.",
        );
        break;
      }
    }
  }
  return warnings;
}
