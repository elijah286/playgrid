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
 *
 * Surfaced 2026-05-05 (second): the recap was emitting raw `x=…, y=…`
 * coordinate pairs. Cal mirrored that style verbatim into coach-facing
 * prose ("CB (x=-10, y=1)"), which is debug output dressed as football.
 * The recap now translates to yards-relative-to-football-landmarks
 * (left/right of center, on/off the LOS, in the backfield) so Cal mirrors
 * football language instead.
 */
export function recapCoachDiagram(diagram: CoachDiagram): string {
  const lines: string[] = [];

  const routesByCarrier = new Map<string, NonNullable<CoachDiagram["routes"]>[number]>();
  for (const r of diagram.routes ?? []) {
    routesByCarrier.set(r.from, r);
  }

  for (const p of diagram.players) {
    const team = p.team === "D" ? "defense" : "offense";
    const align = `lined up ${pos(p.x, p.y)}`;
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
        `path ends ${pos(last[0], last[1])} (${route.path.length} waypoint${route.path.length === 1 ? "" : "s"})`,
      );
    } else {
      parts.push(`no post-snap path`);
    }
    if (route.curve) parts.push(`curved path`);
    if (route.motion && route.motion.length > 0) {
      const lastMotion = route.motion[route.motion.length - 1];
      parts.push(`pre-snap motion ends ${pos(lastMotion[0], lastMotion[1])}`);
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
        `- ${label}(${z.kind}${owner}): centered ${pos(z.center[0], z.center[1])}; ${fmt(z.size[0])} yds wide × ${fmt(z.size[1])} yds deep`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Turn an internal (x, y) yards-pair into football-natural prose.
 * x is yards from center (negative = left, positive = right of the ball).
 * y is yards from the LOS (negative = backfield, positive = downfield).
 */
function pos(x: number, y: number): string {
  return `${side(x)}, ${depth(y)}`;
}

function side(x: number): string {
  if (Math.abs(x) < 0.25) return "over the ball";
  const yds = fmt(Math.abs(x));
  return x < 0 ? `${yds} yds left of center` : `${yds} yds right of center`;
}

function depth(y: number): string {
  if (Math.abs(y) < 0.25) return "on the LOS";
  const yds = fmt(Math.abs(y));
  return y < 0 ? `${yds} yds in the backfield` : `${yds} yds downfield`;
}

function fmt(n: number): string {
  return n.toFixed(1);
}
