/**
 * Photo-import extraction schema — Phase 0 eval.
 *
 * This is the vision model's ENTIRE output contract for reading one play
 * panel. It deliberately contains NO coordinate fields — no x/y, no
 * waypoints, no bboxes. The model names semantics (route family from the
 * catalog, depth in yards, page direction, modifiers) and geometry is
 * derived later by the existing PlaySpec renderer + sanitizer. That is
 * AGENTS.md Rule 5 applied at the extraction boundary: transcribing
 * geometry is structurally impossible, not merely discouraged.
 *
 * The 2026-05/06 image pipeline failed precisely because its output
 * contract was a CoachDiagram (players x/y + route waypoints) — every
 * wobble in a photographed arrow became a geometry error. Here the model
 * answers a classification question instead.
 *
 * Phase 1 promotes this module into src/lib/coach-ai/photo-import/; it
 * lives inside the eval dir until the accuracy bar is met.
 */

import { z } from "zod";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";

export const TOOL_NAME = "submit_play_extraction";

export const extractionConfidenceSchema = z.enum(["high", "med", "low"]);
export type ExtractionConfidence = z.infer<typeof extractionConfidenceSchema>;

/** Mirrors RouteModifier in src/domain/play/spec.ts — kept as a literal
 *  list here so the tool schema can enum it without importing spec
 *  internals. If spec.ts grows a modifier, add it here too (the Phase 1
 *  promotion will unify the two). */
export const EXTRACTION_MODIFIERS = [
  "hot",
  "sit_vs_zone",
  "option",
  "motion",
  "delayed",
  "rub",
  "alert",
] as const;

export const extractedAssignmentSchema = z
  .object({
    /** The letter printed inside the player's circle on the sheet. */
    player: z.string().min(1),
    kind: z.enum(["route", "block", "carry", "motion", "unclear"]),
    /** Route family name from the catalog vocabulary (routes only). */
    family: z.string().optional(),
    /** Deepest point the route reaches past the LOS, in yards. */
    depthYds: z.number().optional(),
    /** Page direction of the break/finish as drawn (offense faces up). */
    direction: z.enum(["left", "right"]).optional(),
    modifiers: z.array(z.string()).optional(),
    confidence: extractionConfidenceSchema,
    /** One short sentence: what visual evidence drove the call, and the
     *  runner-up family when confidence is not "high". */
    evidence: z.string().optional(),
  })
  .strict();
export type ExtractedAssignment = z.infer<typeof extractedAssignmentSchema>;

export const extractedPlayerSchema = z
  .object({
    label: z.string().min(1),
    /** Side of the center as drawn. */
    side: z.enum(["left", "right", "center"]),
    /** 1-based rank across the formation, leftmost player = 1 (C and Q
     *  included). This is the key the synthesizer uses to map sheet
     *  players onto catalog formation slots, so it must reflect drawn
     *  left-to-right order regardless of depth. */
    orderFromLeft: z.number().int().min(1),
    /** Fill color of the player's circle as printed. Drives the draft's
     *  color-matching so the coach can compare photo ↔ draft player by
     *  player. */
    color: z.string().optional(),
    onLos: z.boolean(),
    backfield: z.boolean(),
  })
  .strict();
export type ExtractedPlayer = z.infer<typeof extractedPlayerSchema>;

export const playExtractionSchema = z
  .object({
    title: z.string().optional(),
    players: z.array(extractedPlayerSchema).min(1),
    formation: z
      .object({
        /** Coach-vocabulary name ("Trips Left", "Bunch Right", "Spread
         *  Doubles", "Empty"...). */
        name: z.string().min(1),
        strength: z.enum(["left", "right", "balanced"]).optional(),
        confidence: extractionConfidenceSchema,
      })
      .strict(),
    assignments: z.array(extractedAssignmentSchema).min(1),
    /** Anything the panel shows that the model could not confidently
     *  decode: dashed segments, pennant glyphs, occluded crossings,
     *  possible jet-sweep meshes. */
    ambiguities: z.array(z.string()).optional(),
  })
  .strict();
export type PlayExtraction = z.infer<typeof playExtractionSchema>;

/** Every name the model may put in `family`: canonical template names
 *  plus their aliases. The scorer resolves either form via findTemplate,
 *  so alias picks are not penalized. */
export function routeVocabularyNames(): string[] {
  const names: string[] = [];
  for (const t of ROUTE_TEMPLATES) {
    names.push(t.name);
    for (const a of t.aliases ?? []) names.push(a);
  }
  return names;
}

/**
 * Anthropic tool definition for the extraction call. Hand-written JSON
 * Schema (rather than a zod converter) so the wire contract is explicit
 * and stable; playExtractionSchema above re-validates the model's input
 * on our side, so drift between the two surfaces as a validation error,
 * not a silent acceptance.
 */
export function buildExtractionTool(): {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
} {
  const confidence = { type: "string", enum: ["high", "med", "low"] };
  return {
    name: TOOL_NAME,
    description:
      "Submit the final structured reading of the play panel. Call exactly once, after reasoning through every player's path.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["players", "formation", "assignments"],
      properties: {
        title: { type: "string", description: "Play label printed on the panel, if visible." },
        players: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "side", "orderFromLeft", "color", "onLos", "backfield"],
            properties: {
              label: { type: "string", description: "Letter inside the circle (X, Y, Z, A, B, C, Q...)." },
              side: { type: "string", enum: ["left", "right", "center"] },
              orderFromLeft: { type: "integer", minimum: 1, description: "1-based left-to-right rank across the whole formation as drawn (leftmost player = 1), counting every player including C and Q, regardless of depth." },
              color: {
                type: "string",
                enum: ["black", "gray", "white", "red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "other"],
                description: "Fill color of the circle as printed.",
              },
              onLos: { type: "boolean", description: "True when aligned on the line of scrimmage." },
              backfield: { type: "boolean", description: "True when aligned clearly behind the LOS (excluding Q)." },
            },
          },
        },
        formation: {
          type: "object",
          additionalProperties: false,
          required: ["name", "confidence"],
          properties: {
            name: { type: "string", description: 'Coach-vocabulary formation name, e.g. "Trips Left", "Bunch Right", "Spread Doubles", "Empty".' },
            strength: { type: "string", enum: ["left", "right", "balanced"] },
            confidence,
          },
        },
        assignments: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["player", "kind", "confidence"],
            properties: {
              player: { type: "string" },
              kind: { type: "string", enum: ["route", "block", "carry", "motion", "unclear"] },
              family: {
                type: "string",
                enum: routeVocabularyNames(),
                description: "Route family (routes only). Choose the closest catalog name.",
              },
              depthYds: { type: "number", description: "Deepest point past the LOS in yards, from counting the 5-yard gridlines. Any integer — do not round to template defaults." },
              direction: { type: "string", enum: ["left", "right"], description: "Page direction of the break/finish as drawn." },
              modifiers: { type: "array", items: { type: "string", enum: [...EXTRACTION_MODIFIERS] } },
              confidence,
              evidence: { type: "string", description: "One sentence: the visual evidence, plus the runner-up family when not high-confidence." },
            },
          },
        },
        ambiguities: {
          type: "array",
          items: { type: "string" },
          description: "Notation you could not confidently decode (dashed segments, pennant glyphs, occlusions, possible handoff meshes).",
        },
      },
    },
  };
}
