import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";

/**
 * Plain-English per-player recap of a CoachDiagram. Sits next to the JSON
 * blob in Cal's system prompt so the per-route ground truth is easier to
 * scan than the raw JSON. Every field is a direct translation — no route
 * inference, no name guessing. Empty/missing fields are surfaced as such
 * ("no route_kind declared") so Cal doesn't fill them in from prior turns.
 *
 * Surfaced 2026-05-05: with a long conversation history Cal would carry
 * a hallucinated route description over the JSON in the system prompt.
 * The recap makes per-player facts more salient to anchor on.
 */
export function recapCoachDiagram(diagram: CoachDiagram): string {
  const lines: string[] = [];

  const routesByCarrier = new Map<string, NonNullable<CoachDiagram["routes"]>[number]>();
  for (const r of diagram.routes ?? []) {
    routesByCarrier.set(r.from, r);
  }

  for (const p of diagram.players) {
    const team = p.team === "D" ? "defense" : "offense";
    const align = `lined up at x=${fmt(p.x)}, y=${fmt(p.y)}`;
    const role = p.role && p.role !== p.id ? ` ("${p.role}")` : "";
    const route = routesByCarrier.get(p.id);
    if (!route) {
      lines.push(`- @${p.id}${role} (${team}, ${align}): no route assigned`);
      continue;
    }
    const parts: string[] = [];
    parts.push(route.route_kind ? `route_kind="${route.route_kind}"` : `no route_kind declared`);
    if (route.path && route.path.length > 0) {
      const last = route.path[route.path.length - 1];
      parts.push(
        `path ends at x=${fmt(last[0])}, y=${fmt(last[1])} (${route.path.length} waypoint${route.path.length === 1 ? "" : "s"})`,
      );
    } else {
      parts.push(`no post-snap path`);
    }
    if (route.curve) parts.push(`curved path`);
    if (route.motion && route.motion.length > 0) {
      const lastMotion = route.motion[route.motion.length - 1];
      parts.push(`pre-snap motion ends at x=${fmt(lastMotion[0])}, y=${fmt(lastMotion[1])}`);
    }
    lines.push(`- @${p.id}${role} (${team}, ${align}): ${parts.join("; ")}`);
  }

  if (diagram.zones && diagram.zones.length > 0) {
    lines.push("");
    lines.push("Coverage zones:");
    for (const z of diagram.zones) {
      const label = z.label ? `"${z.label}" ` : "";
      const owner = z.ownerLabel ? ` owned by @${z.ownerLabel}` : "";
      lines.push(
        `- ${label}(${z.kind}${owner}): centered at x=${fmt(z.center[0])}, y=${fmt(z.center[1])}; size ${fmt(z.size[0])} × ${fmt(z.size[1])} yds`,
      );
    }
  }

  return lines.join("\n");
}

function fmt(n: number): string {
  return n.toFixed(1);
}
