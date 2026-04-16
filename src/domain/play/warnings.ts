import type { PlayDocument } from "./types";

/** Rule hooks for motion / eligibility — v1 returns light warnings */
export function evaluateSportWarnings(doc: PlayDocument): string[] {
  const warnings: string[] = [];
  const motionRoutes = doc.layers.routes.filter((r) => r.motion);
  if (doc.sportProfile.motionMustNotAdvanceTowardGoal && motionRoutes.length > 0) {
    for (const r of motionRoutes) {
      if (r.nodes.length < 2) continue;
      const start = r.nodes[0].position;
      const last = r.nodes[r.nodes.length - 1].position;
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
