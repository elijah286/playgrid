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
  DefenderAction,
  DefenderAssignment,
  PlaySpec,
  PlayerAssignment,
} from "@/domain/play/spec";
import { findTemplate } from "@/domain/play/routeTemplates";
import { detectConcept } from "@/domain/play/conceptMatch";
import {
  alignmentWithAssignments,
  findDefensiveAlignment,
  zonesForStrength,
  type DefenderAssignmentSpec,
  type DefensiveAlignmentZone,
} from "@/domain/play/defensiveAlignments";

/** Render a PlaySpec into coaching notes. */
export function projectSpecToNotes(spec: PlaySpec): string {
  const lines: string[] = [];

  // Concept-name lead. If the spec satisfies a known concept (curl-flat,
  // smash, mesh, stick, snag, four-verts), name it explicitly so the
  // coach reads "Curl-Flat — high-low on the flat defender" instead of
  // a generic "QB reads the safety". Concepts also encode depth/family
  // invariants the spec already satisfies, so the prose can be more
  // tactical without risking contradictions.
  const conceptHit = detectConcept(spec);
  if (conceptHit && conceptHit.ok) {
    lines.push(`**${conceptHit.concept.name}** — ${conceptHit.concept.description}`);
  }

  // Opener — depends on play type.
  const opener = openerFor(spec);
  if (opener) lines.push(opener);

  // Per-assignment bullet. Skip `unspecified` — they add noise.
  for (const assignment of spec.assignments) {
    const bullet = bulletFor(assignment);
    if (bullet) lines.push(`- ${bullet}`);
  }

  // Defender bullets — one per defender (catalog default + spec deviations).
  // For offense-focused plays we emit a compact "Defense:" header followed
  // by the per-defender lines. Suppress when the spec has no defense ref.
  const defenderLines = bulletsForDefense(spec);
  if (defenderLines.length > 0) {
    lines.push("");
    lines.push("**Defense:**");
    for (const dl of defenderLines) lines.push(`- ${dl}`);
  }

  // Defensive note: if no assignments rendered, fall back to a one-line
  // formation+defense summary so the field isn't empty.
  if (lines.length === 0) {
    lines.push(summaryLine(spec));
  }

  return lines.join("\n");
}

/**
 * Build per-defender bullets from the spec's defense ref (catalog
 * defaults) overlaid with `spec.defenderAssignments` (deviations). Each
 * line names the defender + role + a short coaching cue from
 * DEFENDER_CUES below.
 */
function bulletsForDefense(spec: PlaySpec): string[] {
  if (!spec.defense) return [];
  const { front, coverage, strength = "right" } = spec.defense;
  const alignment = findDefensiveAlignment(spec.variant, front, coverage);
  if (!alignment) return [];

  const catalogPlayers = alignmentWithAssignments(alignment, strength);
  const zones = zonesForStrength(alignment, strength);
  const zoneById = new Map<string, DefensiveAlignmentZone>();
  for (const z of zones) {
    if (z.id) zoneById.set(z.id, z);
  }

  const overrides = new Map<string, DefenderAssignment>();
  for (const da of spec.defenderAssignments ?? []) {
    if (!overrides.has(da.defender)) overrides.set(da.defender, da);
  }

  const lines: string[] = [];
  for (const cp of catalogPlayers) {
    const ref = `@${cp.id}`;
    const override = overrides.get(cp.id);
    const action: DefenderAction = override
      ? override.action
      : defenderActionFromCatalog(cp.assignment);
    const hedge =
      override?.confidence === "low" ? "(unconfirmed) " : "";
    const body = narrateDefender(ref, action, zoneById);
    if (body) lines.push(`${hedge}${body}`);
  }
  return lines;
}

function defenderActionFromCatalog(c: DefenderAssignmentSpec): DefenderAction {
  switch (c.kind) {
    case "zone": return { kind: "zone_drop", zoneId: c.zoneId };
    case "man":  return { kind: "man_match", target: c.target };
    case "blitz": return { kind: "blitz", gap: c.gap };
    case "spy":  return { kind: "spy", target: c.target };
  }
}

function narrateDefender(
  ref: string,
  action: DefenderAction,
  zoneById: Map<string, DefensiveAlignmentZone>,
): string | null {
  switch (action.kind) {
    case "zone_drop": {
      const zone = action.zoneId ? zoneById.get(action.zoneId) : null;
      const label = zone?.label ?? action.zoneId ?? "zone";
      const cue = DEFENDER_CUES.zone_drop;
      return `${ref}: drops into ${label} — ${cue}.`;
    }
    case "man_match": {
      const target = action.target ? `@${action.target}` : "his matched receiver";
      const cue = DEFENDER_CUES.man_match;
      return `${ref}: man on ${target} — ${cue}.`;
    }
    case "blitz": {
      const gap = action.gap ?? "A";
      const cue = DEFENDER_CUES.blitz;
      return `${ref}: blitz ${gap}-gap — ${cue}.`;
    }
    case "spy": {
      const target = action.target ? `@${action.target}` : "the QB";
      const cue = DEFENDER_CUES.spy;
      return `${ref}: spy ${target} — ${cue}.`;
    }
    case "read_and_react": {
      const cue = DEFENDER_CUES[`react_${action.behavior}` as keyof typeof DEFENDER_CUES] ?? DEFENDER_CUES.read_and_react;
      const trigger = `@${action.trigger.player}`;
      return `${ref}: read ${trigger} — ${cue}.`;
    }
    case "custom_path":
      return `${ref}: ${action.description}.`;
  }
}

/**
 * Per-kind coaching cues for defenders. Single line, no trailing period
 * (caller adds it). New defender kinds added in spec.ts MUST add a cue
 * here in the same commit (Rule 3 lockstep).
 */
const DEFENDER_CUES = {
  zone_drop: "stay in the void, eyes on the QB",
  man_match: "press the release, stay on the inside hip",
  blitz: "win the half-man, get to the QB on the third step",
  spy: "shadow the player, mirror lateral movement, fall to the LOS on a scramble",
  read_and_react: "key the offensive player, react when they declare",
  react_jump_route: "drive on the route once it breaks across",
  react_carry_vertical: "carry the vertical until the deep defender takes it",
  react_follow_to_flat: "follow the inside-out release into the flat",
  react_wall_off: "wall off the crosser before they cross your face",
  react_robber: "lurk for a crossing route at intermediate depth",
} as const;

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
