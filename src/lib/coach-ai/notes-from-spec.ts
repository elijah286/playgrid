/**
 * Spec → Notes projection.
 *
 * Generates canonical coaching notes from a PlaySpec. Output is plain
 * text with @Label player references that the renderer auto-links to the
 * diagram tokens. Intended uses:
 *   - Initial notes draft when Cal creates a play with a PlaySpec.
 *   - Lint-pass reference: when Cal rephrases the prose in its own voice,
 *     a future Phase 4+ check parses the rephrased notes back to spec
 *     assignments and rejects mismatches.
 *
 * Style matches the conventions in update_play_notes' description:
 *   - Per-player @Label references (e.g. @X, @Z, @F)
 *   - Short bullets, scannable
 *   - Open with QB read for offense, with watch-fors for defense
 *   - Per-route bullet derived from the catalog's coaching cue
 *
 * Why projection (not LLM generation):
 *   - Bidirectional invariant: the same spec produces the same notes,
 *     deterministically. The diagram and the prose share a source.
 *   - Coverage: every assignment in the spec gets a bullet — no silent
 *     omission of a receiver who has a route but no narration.
 *   - Drift: when the catalog's coaching cue updates, the notes update
 *     for free — no "KB drifted from catalog" failure mode.
 *
 * What this is NOT:
 *   - A replacement for human coaching language. Cal can rephrase the
 *     output in its voice; the lint pass (Phase 4) will keep it factual.
 *   - A pose classifier. If the spec doesn't have an assignment for a
 *     player, this function does NOT invent one.
 */

import type {
  AssignmentAction,
  PlaySpec,
  PlayerAssignment,
} from "@/domain/play/spec";
import { findTemplate } from "@/domain/play/routeTemplates";

/** Render a PlaySpec into coaching notes. */
export function projectSpecToNotes(spec: PlaySpec): string {
  const lines: string[] = [];

  // Opener — depends on play type.
  const opener = openerFor(spec);
  if (opener) lines.push(opener);

  // Per-assignment bullet. Skip `unspecified` — they add noise.
  for (const assignment of spec.assignments) {
    const bullet = bulletFor(assignment);
    if (bullet) lines.push(`- ${bullet}`);
  }

  // Defensive note: if no assignments rendered, fall back to a one-line
  // formation+defense summary so the field isn't empty.
  if (lines.length === 0) {
    lines.push(summaryLine(spec));
  }

  return lines.join("\n");
}

function openerFor(spec: PlaySpec): string | null {
  const playType = spec.playType ?? "offense";
  if (playType === "offense") {
    return openerForOffense(spec);
  }
  if (playType === "defense") {
    return openerForDefense(spec);
  }
  return null;
}

function openerForOffense(spec: PlaySpec): string {
  const formationLabel = spec.formation.name || "the formation";
  const defenseLabel = spec.defense
    ? ` vs ${spec.defense.front === spec.defense.coverage ? spec.defense.coverage : `${spec.defense.front} ${spec.defense.coverage}`}`
    : "";
  // Identify the QB read by walking assignments — the deepest inside
  // route is usually the primary, with a quick-game outlet underneath.
  // For a v1 projection we just name the play context; Phase 4 will
  // teach this function to walk assignments and infer the read.
  return `@Q reads ${formationLabel}${defenseLabel}: take the open window — work the progression below in order.`;
}

function openerForDefense(spec: PlaySpec): string {
  const defenseLabel = spec.defense
    ? `${spec.defense.front === spec.defense.coverage ? spec.defense.coverage : `${spec.defense.front} ${spec.defense.coverage}`}`
    : "this defense";
  return `Defense in ${defenseLabel}: read pre-snap formation and listen for motion calls before the snap.`;
}

function summaryLine(spec: PlaySpec): string {
  const formation = spec.formation.name || "Spread";
  const defense = spec.defense ? ` vs ${spec.defense.coverage}` : "";
  return `${formation}${defense}.`;
}

function bulletFor(assignment: PlayerAssignment): string | null {
  const ref = `@${assignment.player}`;
  const body = narrateAction(ref, assignment.action);
  if (!body) return null;
  // Hedging: low-confidence assignments get prefixed with "(unconfirmed)"
  // so the coach knows Cal isn't sure. Keeps the structural meaning
  // visible (the family/depth/side stay accurate) while flagging that
  // it's a guess. Confidence is set by the parser based on match quality
  // or by Cal explicitly when authoring.
  if (assignment.confidence === "low") {
    return `(unconfirmed) ${body}`;
  }
  return body;
}

function narrateAction(ref: string, action: AssignmentAction): string | null {
  switch (action.kind) {
    case "route":
      return narrateRoute(ref, action);
    case "block":
      return narrateBlock(ref, action);
    case "carry":
      return narrateCarry(ref, action);
    case "motion":
      return narrateMotion(ref, action);
    case "custom":
      return `${ref}: ${action.description}.`;
    case "unspecified":
      return null;
  }
}

function narrateRoute(
  ref: string,
  action: Extract<AssignmentAction, { kind: "route" }>,
): string {
  const template = findTemplate(action.family);
  if (!template) {
    return `${ref}: ${action.family} route.`;
  }

  // Depth: catalog midpoint (v1). Phase 4 will use action.depthYds when set
  // and tighten the projection to the actual rendered geometry.
  const { depthRangeYds } = template.constraints;
  const canonicalDepth = action.depthYds ?? Math.round((depthRangeYds.min + depthRangeYds.max) / 2);

  const sideLabel = sideLabelFor(template.constraints.side);
  const modifierClause = formatModifiers(action.modifiers);

  // Per-family coaching cue — small fixed dictionary keyed by canonical
  // family name. Anything not in the dictionary falls back to a generic
  // depth+side template. Adding a route to the catalog should add a cue
  // here in the same commit.
  const cue = ROUTE_CUES[template.name.toLowerCase()] ?? "";
  const cuePart = cue ? ` — ${cue}` : "";

  return `${ref}: ${canonicalDepth}-yard ${template.name.toLowerCase()}${sideLabel}${modifierClause}${cuePart}.`;
}

function narrateBlock(
  ref: string,
  action: Extract<AssignmentAction, { kind: "block" }>,
): string {
  if (!action.target) return `${ref}: pass protect.`;
  if (action.target === "edge") return `${ref}: protect the edge — pick up the first defender outside.`;
  if (action.target === "interior") return `${ref}: protect interior — pick up A/B-gap pressure.`;
  if (action.target === "blitz") return `${ref}: blitz pickup — find the unblocked rusher.`;
  return `${ref}: block @${action.target}.`;
}

function narrateCarry(
  ref: string,
  action: Extract<AssignmentAction, { kind: "carry" }>,
): string {
  const cue = action.runType ? RUN_CUES[action.runType] ?? "" : "";
  const cuePart = cue ? ` — ${cue}` : "";
  if (action.runType) {
    return `${ref}: ${formatRunType(action.runType)}${cuePart}.`;
  }
  return `${ref}: take the handoff and run the called gap.`;
}

function narrateMotion(
  ref: string,
  action: Extract<AssignmentAction, { kind: "motion" }>,
): string {
  if (!action.into) return `${ref}: pre-snap motion.`;
  if (typeof action.into === "string") return `${ref}: motion to @${action.into}'s alignment before the snap.`;
  return `${ref}: motion to set position before the snap.`;
}

function sideLabelFor(side: "toward_qb" | "toward_sideline" | "vertical" | "varies"): string {
  if (side === "toward_qb") return " inside";
  if (side === "toward_sideline") return " to the sideline";
  if (side === "vertical") return ""; // vertical is implicit ("12-yard go")
  return "";
}

function formatModifiers(modifiers: ReadonlyArray<string> | undefined): string {
  if (!modifiers || modifiers.length === 0) return "";
  const parts: string[] = [];
  for (const m of modifiers) {
    if (m === "hot") parts.push("hot vs blitz");
    else if (m === "sit_vs_zone") parts.push("settle vs zone, run vs man");
    else if (m === "option") parts.push("option route — read leverage");
    else if (m === "delayed") parts.push("delayed release");
    else if (m === "rub") parts.push("set up the rub");
    else if (m === "alert") parts.push("QB's alert");
    else if (m === "motion") parts.push("after motion");
  }
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function formatRunType(t: NonNullable<Extract<AssignmentAction, { kind: "carry" }>["runType"]>): string {
  switch (t) {
    case "inside_zone": return "inside zone";
    case "outside_zone": return "outside zone";
    case "power": return "power";
    case "counter": return "counter";
    case "trap": return "trap";
    case "draw": return "draw";
    case "sweep": return "sweep";
    case "qb_keep": return "QB keep";
    case "scramble": return "scramble lane";
  }
}

/**
 * Per-family coaching cues. Single line, no period (caller adds it).
 * Keep these short and tactical — they ride on the depth/side already
 * stated by the bullet, so don't repeat that information.
 */
const ROUTE_CUES: Record<string, string> = {
  slant: "sharp break at the inside hip, catch in stride and turn upfield",
  go: "full-speed release, ball goes over the top",
  post: "plant hard at the break, separate from the safety",
  corner: "sell vertical, snap to the back pylon",
  comeback: "come back hard to the sideline, work back to the throw",
  out: "snap the head around at the break, sideline outlet",
  in: "drive vertical then break flat across the LBs",
  curl: "settle in the soft spot, face the QB",
  hitch: "quick stop, eyes back to the QB on rhythm",
  "quick out": "speed out — no break-down, snap to the sideline",
  drag: "shallow cross, find the void in zone",
  flat: "release flat — outlet for the QB",
  fade: "back-shoulder window, defender's hip",
  wheel: "flat then turn it up — beat the LB to the sideline",
  bubble: "release back and outside, eyes find the ball",
  whip: "sell the out, snap back inside",
  spot: "settle in the soft spot at 6 yds",
  "skinny post": "shallow inside angle — fit between safety and corner",
  dig: "vertical 12, sharp inside break, sit in the window",
  seam: "split the safeties, run through the post",
  "stop & go": "sell the hitch, then take it deep",
  "out & up": "sell the out, then up the sideline",
  arrow: "slight angle to the flat, gain depth gradually",
  sit: "settle in the void, face the QB",
  "z-out": "deeper out — break flat at 7 yds",
  "z-in": "deeper in — break flat at 7 yds, sit in window",
};

const RUN_CUES: Record<NonNullable<Extract<AssignmentAction, { kind: "carry" }>["runType"]>, string> = {
  inside_zone: "press the LOS, read the first down-block, cut on the second LB's flow",
  outside_zone: "stretch wide, plant and bend back if the edge isn't sealed",
  power: "downhill behind the pulling guard, find the hole behind the kick-out",
  counter: "false step, then follow pullers to the back side",
  trap: "press into the hole, the trap block opens it late",
  draw: "delay then accelerate — read the rush lane",
  sweep: "wide path behind the pullers, set up the kick-out",
  qb_keep: "QB keeps and reads the unblocked edge",
  scramble: "find the lane outside the pocket",
};
