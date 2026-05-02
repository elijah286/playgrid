/**
 * Defense validator goldens — Phase D4.
 *
 * Each test pins one validation rule with a minimal failing input.
 * When the rule's behavior changes, exactly one test should turn red,
 * making the change reviewable. Mirrors route-assignment-validate.test.ts.
 */

import { describe, expect, it } from "vitest";
import { validateDefenderAssignments } from "./defense-validate";
import { PLAY_SPEC_SCHEMA_VERSION, type PlaySpec } from "@/domain/play/spec";

function makeSpec(overrides: Partial<PlaySpec> = {}): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "flag_7v7",
    formation: { name: "Spread Doubles" },
    defense: { front: "7v7 Zone", coverage: "Cover 3" },
    assignments: [
      { player: "X", action: { kind: "route", family: "Slant" } },
      { player: "Z", action: { kind: "route", family: "Post" } },
      { player: "H", action: { kind: "route", family: "Hitch" } },
      { player: "S", action: { kind: "route", family: "Flat" } },
    ],
    ...overrides,
  };
}

describe("Defense validator (Phase D4)", () => {
  it("clean override (zone_drop with valid zoneId) passes", () => {
    const spec = makeSpec({
      defenderAssignments: [
        { defender: "FS", action: { kind: "zone_drop", zoneId: "deep_third_m" } },
      ],
    });
    expect(validateDefenderAssignments(spec)).toEqual({ ok: true });
  });

  it("zone_drop on a coverage with no zones (Cover 0) is rejected", () => {
    const spec = makeSpec({
      defense: { front: "7v7 Man", coverage: "Cover 0" },
      defenderAssignments: [
        { defender: "FS", action: { kind: "zone_drop", zoneId: "deep_middle" } },
      ],
    });
    const result = validateDefenderAssignments(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].kind).toBe("zone_drop");
    expect(result.errors[0].message).toMatch(/no zones/);
  });

  it("zone_drop with unknown zoneId is rejected", () => {
    const spec = makeSpec({
      defenderAssignments: [
        { defender: "FS", action: { kind: "zone_drop", zoneId: "the_void" } },
      ],
    });
    const result = validateDefenderAssignments(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/the_void/);
  });

  it("man_match targeting a non-existent offensive player is rejected", () => {
    const spec = makeSpec({
      defenderAssignments: [
        { defender: "CB", action: { kind: "man_match", target: "GHOST" } },
      ],
    });
    const result = validateDefenderAssignments(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].kind).toBe("man_match");
  });

  it("read_and_react triggering off a non-existent offensive player is rejected", () => {
    const spec = makeSpec({
      defenderAssignments: [
        {
          defender: "WL",
          action: {
            kind: "read_and_react",
            trigger: { player: "PHANTOM" },
            behavior: "jump_route",
          },
        },
      ],
    });
    const result = validateDefenderAssignments(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].kind).toBe("read_and_react");
  });

  it("duplicate defender is rejected", () => {
    const spec = makeSpec({
      defenderAssignments: [
        { defender: "FS", action: { kind: "zone_drop", zoneId: "deep_third_m" } },
        { defender: "FS", action: { kind: "blitz", gap: "A" } },
      ],
    });
    const result = validateDefenderAssignments(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.find((e) => e.kind === "duplicate")).toBeDefined();
  });

  it("defenderAssignments without spec.defense is rejected", () => {
    const spec = makeSpec({
      defense: undefined,
      defenderAssignments: [{ defender: "FS", action: { kind: "blitz" } }],
    });
    const result = validateDefenderAssignments(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].kind).toBe("missing_defense");
  });

  it("custom_path with no waypoints is rejected", () => {
    const spec = makeSpec({
      defenderAssignments: [
        { defender: "FS", action: { kind: "custom_path", description: "robber" } },
      ],
    });
    const result = validateDefenderAssignments(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].kind).toBe("custom_path");
  });

  it("blitz with undefined gap is allowed (defaults at render)", () => {
    const spec = makeSpec({
      defenderAssignments: [{ defender: "HL", action: { kind: "blitz" } }],
    });
    expect(validateDefenderAssignments(spec)).toEqual({ ok: true });
  });

  it("unknown defender id is rejected with available list", () => {
    const spec = makeSpec({
      defenderAssignments: [{ defender: "GHOST", action: { kind: "blitz" } }],
    });
    const result = validateDefenderAssignments(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/Available:/);
  });
});
