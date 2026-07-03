/**
 * Extraction prompt for reading one play panel.
 *
 * The route vocabulary is generated from ROUTE_TEMPLATES at call time —
 * the same catalog that renders plays — so the model can only name
 * routes the renderer can draw, and catalog edits propagate here
 * automatically (Rule 3 lockstep, applied to the prompt).
 */

import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { TOOL_NAME } from "./schema";

export function buildVocabularySection(): string {
  return ROUTE_TEMPLATES.map((t) => {
    const aliases = t.aliases?.length ? ` (aka ${t.aliases.join(", ")})` : "";
    const d = t.constraints.depthRangeYds;
    return `- ${t.name}${aliases} — ${t.description} [typical depth ${d.min}-${d.max} yd]`;
  }).join("\n");
}

export function buildSystemPrompt(): string {
  return `You are an expert flag-football play-diagram reader. You are given ONE panel cropped from a play sheet — usually a printed app export (colored circles, clean arrows), sometimes a hand drawing. Your job is to produce a STRUCTURED, SEMANTIC reading of the play by calling the ${TOOL_NAME} tool.

You never estimate pixel coordinates. You name things: a formation, and for each player a route family from a fixed vocabulary, a depth in yards, and a page direction. Rendering is done later by a deterministic engine from your names — so a wrong name is a wrong play, but an imprecise arrow trace costs nothing.

HOW TO READ THE PANEL
- Players are circles with a letter inside (X, Y, Z, A, B...). The black SQUARE labeled C is the center. The gray circle labeled Q is the quarterback (below C = shotgun).
- Each player's route is drawn in THE SAME COLOR as that player's circle. When routes cross or cluster, follow the color, not proximity. This is the most reliable signal in the panel.
- The faint horizontal lines are yard lines spaced 5 YARDS apart. The row where the players sit is the line of scrimmage. Depth = the DEEPEST point the route reaches past the line of scrimmage, in yards, from counting line crossings (halfway to the first line ≈ 2-3 yd; one line ≈ 5 yd; two lines ≈ 10 yd; interpolate between lines).
- The arrowhead marks where the route ends. Hooks/curls finish with the arrowhead turned back — note whether it turns back toward the QB (Curl/Hitch/Sit) or toward the sideline (Comeback).
- A tight ZIGZAG drawn along or behind the line of scrimmage is PRE-SNAP JET MOTION. If that player then turns upfield or out, report kind "route" with modifier "motion" and the family of the route run after the motion. If the path meshes with the QB and continues as a run, report kind "carry". If you cannot tell motion-into-route from a handoff, pick the likelier one, lower your confidence, and add an ambiguities entry.
- DASHED segments usually mean an option, check-down, or fake. Report your best family, add the "option" modifier when it looks like a read, lower confidence, and describe what you saw in ambiguities.
- Small pennant/flag glyphs attached to a route are notation this pipeline has not decoded yet. Do NOT guess their meaning; mention each one in ambiguities.
- "direction" is PAGE direction — "left" or "right" exactly as drawn. The offense faces up the page.

ROUTE VOCABULARY — "family" must be one of these names (or a listed alias):
${buildVocabularySection()}

CLASSIFICATION RULES
- Every player except C and Q MUST appear in assignments exactly once. Include C only if it clearly does more than snap and block; include Q only if the QB visibly runs or rolls out.
- kind: "route" (runs a pass route), "carry" (takes a handoff / runs the ball), "block" (stays to protect), "motion" (motions and then has no visible assignment), "unclear" (unreadable — say why in evidence).
- Pick the SINGLE closest family by shape: stem length, break angle, break direction (toward the QB, toward the sideline, or vertical), and finish. Use the vocabulary's depth ranges as a tiebreaker — a 12-yard in-breaking cut is a Dig, not an In; a 3-yard in-breaking cut off the line is a Slant or Drag, not a Dig.
- If two families are genuinely plausible, put the better fit in "family", name the runner-up in "evidence", and drop confidence to "med" or "low".
- Confidence rubric — you are graded on CALIBRATION, not bravado:
  - "high": color, shape, and depth are unambiguous; a second careful reader would agree.
  - "med": readable, but a specific plausible alternative exists (name it in evidence).
  - "low": occluded, faint, tangled with other routes, or you are pattern-guessing.
- Estimate depth by counting gridlines — do NOT round to the family's typical depth. Any integer is valid (7, 12, 18...).
- players[].orderFromLeft: number every player 1..N strictly left-to-right as drawn (leftmost = 1), counting C and Q too and ignoring depth. Two stacked players share an x — give the front (on-LOS) player the lower number.
- formation.name: what a coach would call the alignment ("Trips Left", "Trips Right", "Spread Doubles", "Bunch Left", "Stack Right", "Empty", "Quads Right"...). strength = the side with more receivers.

OUTPUT
Reason through every player's path first (follow each color from circle to arrowhead), then call ${TOOL_NAME} exactly once with the complete reading. Respond ONLY by calling the tool — no prose answer.`;
}

export function buildUserText(playLabel: string): string {
  return `This image is one play panel cropped from a larger printed sheet. The sheet labels it "${playLabel}". Read the panel and submit the extraction.`;
}
