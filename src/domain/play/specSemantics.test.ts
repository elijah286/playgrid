/**
 * Tests for the ball-flow semantics validator.
 *
 * Each rule has a positive test (valid spec passes) and a negative
 * test (the specific violation fires). Multi-violation specs are
 * exercised separately to confirm all violations surface in one pass.
 */

import { describe, expect, it } from "vitest";
import { PLAY_SPEC_SCHEMA_VERSION, type PlaySpec } from "./spec";
import { validatePlaySpecBallFlow } from "./specSemantics";

function bareSpec(overrides: Partial<PlaySpec> = {}): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "tackle_11",
    formation: { name: "Spread Doubles" },
    assignments: [],
    ...overrides,
  };
}

describe("validatePlaySpecBallFlow — rpo_read", () => {
  it("passes when giveTo and passTo differ", () => {
    const spec = bareSpec({
      assignments: [
        {
          player: "QB",
          action: {
            kind: "rpo_read",
            keyDefenderRole: "playside_lb",
            giveTo: "B",
            passTo: "S",
          },
        },
      ],
    });
    expect(validatePlaySpecBallFlow(spec).ok).toBe(true);
  });

  it("rejects giveTo === passTo (degenerate decision)", () => {
    const spec = bareSpec({
      assignments: [
        {
          player: "QB",
          action: {
            kind: "rpo_read",
            keyDefenderRole: "playside_lb",
            giveTo: "B",
            passTo: "B",
          },
        },
      ],
    });
    const result = validatePlaySpecBallFlow(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0].code).toBe("rpo_read_give_equals_pass");
  });
});

describe("validatePlaySpecBallFlow — ballPath self-handoff", () => {
  it("passes when each step's from and to are distinct", () => {
    const spec = bareSpec({
      ballPath: [
        { from: "QB", to: "B", atPoint: [0, 0] },
        { from: "B", to: "Z", atPoint: [3, -1] },
      ],
    });
    expect(validatePlaySpecBallFlow(spec).ok).toBe(true);
  });

  it("rejects a step where from === to", () => {
    const spec = bareSpec({
      ballPath: [{ from: "QB", to: "QB", atPoint: [0, 0] }],
    });
    const result = validatePlaySpecBallFlow(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.some((v) => v.code === "ballpath_step_self_handoff")).toBe(true);
  });
});

describe("validatePlaySpecBallFlow — ballPath continuity", () => {
  it("rejects a discontinuous chain (step 2 doesn't start from step 1's destination)", () => {
    const spec = bareSpec({
      ballPath: [
        { from: "QB", to: "B", atPoint: [0, 0] },
        // Discontinuity: "Z" never held the ball. The ball was last in
        // @B's hands; step 2's `from` should be @B.
        { from: "Z", to: "Y", atPoint: [3, -1] },
      ],
    });
    const result = validatePlaySpecBallFlow(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.some((v) => v.code === "ballpath_step_discontinuity")).toBe(true);
  });

  it("accepts a continuous reverse: QB → B → Z (B is both the step-1 receiver and step-2 giver)", () => {
    const spec = bareSpec({
      ballPath: [
        { from: "QB", to: "B", atPoint: [0, 0] },
        { from: "B", to: "Z", atPoint: [3, -1] },
      ],
    });
    expect(validatePlaySpecBallFlow(spec).ok).toBe(true);
  });

  it("accepts a single-step handoff (no continuity to check)", () => {
    const spec = bareSpec({
      ballPath: [{ from: "QB", to: "B", atPoint: [0, 0] }],
    });
    expect(validatePlaySpecBallFlow(spec).ok).toBe(true);
  });
});

describe("validatePlaySpecBallFlow — lateral back to prior handler must be behind LOS", () => {
  it("accepts a Flea Flicker shape with both meshes behind the LOS", () => {
    const spec = bareSpec({
      ballPath: [
        { from: "QB", to: "Z",  atPoint: [2, -3] },
        { from: "Z",  to: "QB", atPoint: [1, -5] },
      ],
    });
    expect(validatePlaySpecBallFlow(spec).ok).toBe(true);
  });

  it("rejects a pitch-back AT the LOS (y=0)", () => {
    const spec = bareSpec({
      ballPath: [
        { from: "QB", to: "Z",  atPoint: [2, -3] },
        { from: "Z",  to: "QB", atPoint: [1, 0] },
      ],
    });
    const result = validatePlaySpecBallFlow(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.some((v) => v.code === "ballpath_lateral_back_forward_of_los")).toBe(true);
  });

  it("rejects a pitch-back PAST the LOS (y>0) — would be an illegal forward pass", () => {
    const spec = bareSpec({
      ballPath: [
        { from: "QB", to: "Z",  atPoint: [2, -3] },
        { from: "Z",  to: "QB", atPoint: [1, 2] },
      ],
    });
    const result = validatePlaySpecBallFlow(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.some((v) => v.code === "ballpath_lateral_back_forward_of_los")).toBe(true);
  });

  it("does NOT flag a forward-progressing reverse (Jet Reverse: QB → B → X, no return to prior)", () => {
    // Jet Reverse's second step is X (a NEW handler, not a return).
    // Even if the second mesh point were at or past the LOS (it
    // shouldn't be, but mechanically), this rule wouldn't fire.
    const spec = bareSpec({
      ballPath: [
        { from: "QB", to: "B", atPoint: [0, -4] },
        { from: "B",  to: "X", atPoint: [3, -3] },
      ],
    });
    expect(validatePlaySpecBallFlow(spec).ok).toBe(true);
  });

  it("does NOT fire when the lateral-back step has no explicit atPoint (renderer infers)", () => {
    const spec = bareSpec({
      ballPath: [
        { from: "QB", to: "Z" },
        { from: "Z",  to: "QB" },
      ],
    });
    expect(validatePlaySpecBallFlow(spec).ok).toBe(true);
  });
});

describe("validatePlaySpecBallFlow — combined violations", () => {
  it("reports ALL violations in one pass", () => {
    const spec = bareSpec({
      assignments: [
        {
          player: "QB",
          action: {
            kind: "rpo_read",
            keyDefenderRole: "playside_lb",
            giveTo: "B",
            passTo: "B", // violation 1: give_equals_pass
          },
        },
      ],
      ballPath: [
        { from: "QB", to: "QB" }, // violation 2: self_handoff
        { from: "Z",  to: "Y"  }, // violation 3: discontinuity (and 4: another self-handoff would be needed; just discontinuity here)
      ],
    });
    const result = validatePlaySpecBallFlow(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = new Set(result.violations.map((v) => v.code));
    expect(codes.has("rpo_read_give_equals_pass")).toBe(true);
    expect(codes.has("ballpath_step_self_handoff")).toBe(true);
    expect(codes.has("ballpath_step_discontinuity")).toBe(true);
  });

  it("passes a clean spec with no rpo_read and no ballPath", () => {
    const spec = bareSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
    });
    expect(validatePlaySpecBallFlow(spec).ok).toBe(true);
  });
});
