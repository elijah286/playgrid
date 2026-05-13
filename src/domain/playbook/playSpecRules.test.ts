/**
 * Playbook-rule validator tests.
 *
 * The validator is the gate between Cal's spec output and the playbook's
 * rule-set. These tests pin:
 *   - Every capability fires its OWN violation (positive case).
 *   - When the capability is enabled, the same spec passes (negative case).
 *   - Multi-violation specs report ALL violations at once (not one per
 *     round-trip).
 *   - Scrambles on the QB do NOT count as designed runs.
 *   - Per-variant defaults set sensible capability lists.
 *   - The settings normalizer drops unknown capability strings.
 *
 * Architecture note: these are unit tests against the validator and
 * normalizer. The integration with the play-tools resolver (where
 * Cal's write paths hit the gate) is covered separately by the
 * play-tools tests.
 */

import { describe, expect, it } from "vitest";
import { PLAY_SPEC_SCHEMA_VERSION, type PlaySpec } from "@/domain/play/spec";
import { validatePlaySpecVsRules } from "./playSpecRules";
import {
  defaultSettingsForVariant,
  normalizePlaybookSettings,
  RULE_CAPABILITIES,
} from "./settings";

function bareSpec(overrides: Partial<PlaySpec> = {}): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "tackle_11",
    formation: { name: "Spread Doubles" },
    assignments: [],
    ...overrides,
  };
}

describe("validatePlaySpecVsRules — rpo_read capability", () => {
  it("rejects an rpo_read assignment when the capability is not enabled", () => {
    const spec = bareSpec({
      assignments: [
        {
          player: "QB",
          action: {
            kind: "rpo_read",
            keyDefenderRole: "playside_lb",
            giveTo: "B",
            passTo: "S",
            pullIf: "in",
          },
        },
      ],
    });
    const result = validatePlaySpecVsRules(spec, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].capability).toBe("rpo_read");
  });

  it("passes when rpo_read is enabled", () => {
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
    const result = validatePlaySpecVsRules(spec, ["rpo_read"]);
    expect(result.ok).toBe(true);
  });

  it("does not duplicate the violation across multiple rpo_read assignments", () => {
    // Edge case — a (hypothetical) play with two RPO decisions; we
    // still only want one error message for the missing capability.
    const spec = bareSpec({
      assignments: [
        {
          player: "QB",
          action: { kind: "rpo_read", keyDefenderRole: "playside_lb", giveTo: "B", passTo: "S" },
        },
        {
          player: "Q",
          action: { kind: "rpo_read", keyDefenderRole: "nickel", giveTo: "B", passTo: "X" },
        },
      ],
    });
    const result = validatePlaySpecVsRules(spec, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const rpoViolations = result.violations.filter((v) => v.capability === "rpo_read");
    expect(rpoViolations).toHaveLength(1);
  });
});

describe("validatePlaySpecVsRules — handoff_chain capability", () => {
  it("rejects a ballPath when the capability is not enabled", () => {
    const spec = bareSpec({
      assignments: [
        { player: "QB", action: { kind: "block" } },
        { player: "B", action: { kind: "carry", runType: "sweep" } },
      ],
      ballPath: [{ from: "QB", to: "B", atPoint: [0, 0] }],
    });
    const result = validatePlaySpecVsRules(spec, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.some((v) => v.capability === "handoff_chain")).toBe(true);
  });

  it("passes when handoff_chain is enabled", () => {
    const spec = bareSpec({
      assignments: [
        { player: "QB", action: { kind: "block" } },
        { player: "B", action: { kind: "carry", runType: "sweep" } },
      ],
      ballPath: [{ from: "QB", to: "B", atPoint: [0, 0] }],
    });
    const result = validatePlaySpecVsRules(spec, ["handoff_chain"]);
    expect(result.ok).toBe(true);
  });

  it("does not fire when ballPath is absent or empty", () => {
    const spec = bareSpec({
      assignments: [{ player: "B", action: { kind: "carry", runType: "inside_zone" } }],
    });
    const result = validatePlaySpecVsRules(spec, []);
    expect(result.ok).toBe(true);
  });
});

describe("validatePlaySpecVsRules — designed_qb_run capability", () => {
  it("rejects a QB carry with runType qb_keep when the capability is not enabled", () => {
    const spec = bareSpec({
      assignments: [
        { player: "QB", action: { kind: "carry", runType: "qb_keep" } },
      ],
    });
    const result = validatePlaySpecVsRules(spec, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations.some((v) => v.capability === "designed_qb_run")).toBe(true);
  });

  it("rejects a QB carry with runType draw / power / counter / sweep too", () => {
    for (const runType of ["draw", "power", "counter", "sweep"] as const) {
      const spec = bareSpec({
        assignments: [{ player: "QB", action: { kind: "carry", runType } }],
      });
      const result = validatePlaySpecVsRules(spec, []);
      expect(result.ok, `expected ${runType} on QB to require designed_qb_run`).toBe(false);
    }
  });

  it("does NOT reject a QB scramble (always legal when rushing is on)", () => {
    const spec = bareSpec({
      assignments: [
        { player: "QB", action: { kind: "carry", runType: "scramble" } },
      ],
    });
    const result = validatePlaySpecVsRules(spec, []);
    expect(result.ok, "scramble is reactive, not designed — never gated").toBe(true);
  });

  it("does NOT reject a non-QB carry (RB or back doesn't need designed_qb_run)", () => {
    const spec = bareSpec({
      assignments: [
        { player: "B", action: { kind: "carry", runType: "inside_zone" } },
      ],
    });
    const result = validatePlaySpecVsRules(spec, []);
    expect(result.ok).toBe(true);
  });

  it("does NOT reject a QB carry with no runType (unspecified — other validators handle it)", () => {
    const spec = bareSpec({
      assignments: [{ player: "QB", action: { kind: "carry" } }],
    });
    const result = validatePlaySpecVsRules(spec, []);
    expect(result.ok).toBe(true);
  });

  it("accepts both 'QB' and 'Q' as QB-id casing", () => {
    for (const id of ["QB", "Q", "qb"]) {
      const spec = bareSpec({
        assignments: [{ player: id, action: { kind: "carry", runType: "qb_keep" } }],
      });
      const result = validatePlaySpecVsRules(spec, []);
      expect(result.ok, `expected ${id} carrier to require designed_qb_run`).toBe(false);
    }
  });

  it("passes when designed_qb_run is enabled", () => {
    const spec = bareSpec({
      assignments: [
        { player: "QB", action: { kind: "carry", runType: "qb_keep" } },
      ],
    });
    const result = validatePlaySpecVsRules(spec, ["designed_qb_run"]);
    expect(result.ok).toBe(true);
  });
});

describe("validatePlaySpecVsRules — combined", () => {
  it("reports ALL violations at once (no round-trips needed)", () => {
    // A Spread Inside Zone Bubble RPO with a fake reverse — would
    // trigger all three capabilities. The validator must surface
    // every violation in one pass so the coach (or Cal) can fix
    // them together.
    const spec = bareSpec({
      assignments: [
        {
          player: "QB",
          action: { kind: "rpo_read", keyDefenderRole: "playside_lb", giveTo: "B", passTo: "S" },
        },
        { player: "B", action: { kind: "carry", runType: "qb_keep" } }, // contrived QB-on-B id but valid
        { player: "Q", action: { kind: "carry", runType: "power" } },   // also QB-id with power
      ],
      ballPath: [{ from: "QB", to: "B", atPoint: [0, 0] }],
    });
    const result = validatePlaySpecVsRules(spec, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const capabilities = new Set(result.violations.map((v) => v.capability));
    expect(capabilities.has("rpo_read")).toBe(true);
    expect(capabilities.has("handoff_chain")).toBe(true);
    expect(capabilities.has("designed_qb_run")).toBe(true);
  });

  it("passes when all capabilities are enabled", () => {
    const spec = bareSpec({
      assignments: [
        {
          player: "QB",
          action: { kind: "rpo_read", keyDefenderRole: "playside_lb", giveTo: "B", passTo: "S" },
        },
        { player: "B", action: { kind: "carry", runType: "inside_zone" } },
        { player: "S", action: { kind: "route", family: "Bubble" } },
      ],
      ballPath: [{ from: "QB", to: "B", atPoint: [0, 0] }],
    });
    const result = validatePlaySpecVsRules(spec, [...RULE_CAPABILITIES]);
    expect(result.ok).toBe(true);
  });
});

describe("PlaybookSettings — advancedCapabilities defaults per variant", () => {
  it("tackle_11 defaults to the full capability set", () => {
    const s = defaultSettingsForVariant("tackle_11");
    expect(new Set(s.advancedCapabilities)).toEqual(
      new Set(["designed_qb_run", "handoff_chain", "rpo_read"]),
    );
  });

  it("flag_5v5 defaults to no advanced capabilities (conservative — most 5v5 leagues require a handoff before any run)", () => {
    const s = defaultSettingsForVariant("flag_5v5");
    expect(s.advancedCapabilities).toEqual([]);
  });

  it("flag_7v7 defaults to no advanced capabilities", () => {
    const s = defaultSettingsForVariant("flag_7v7");
    expect(s.advancedCapabilities).toEqual([]);
  });

  it("other defaults to no advanced capabilities (coach opts in explicitly)", () => {
    const s = defaultSettingsForVariant("other");
    expect(s.advancedCapabilities).toEqual([]);
  });
});

describe("normalizePlaybookSettings — advancedCapabilities", () => {
  it("preserves valid capability strings", () => {
    const out = normalizePlaybookSettings(
      { advancedCapabilities: ["rpo_read", "handoff_chain"] },
      "tackle_11",
    );
    expect(new Set(out.advancedCapabilities)).toEqual(
      new Set(["rpo_read", "handoff_chain"]),
    );
  });

  it("drops unknown capability strings without crashing", () => {
    const out = normalizePlaybookSettings(
      { advancedCapabilities: ["rpo_read", "fake_capability", "designed_qb_run"] },
      "tackle_11",
    );
    expect(out.advancedCapabilities).toContain("rpo_read");
    expect(out.advancedCapabilities).toContain("designed_qb_run");
    expect(out.advancedCapabilities).not.toContain("fake_capability");
  });

  it("dedupes repeated entries", () => {
    const out = normalizePlaybookSettings(
      { advancedCapabilities: ["rpo_read", "rpo_read", "rpo_read"] },
      "tackle_11",
    );
    expect(out.advancedCapabilities).toEqual(["rpo_read"]);
  });

  it("falls back to the variant default when the field is missing (legacy row)", () => {
    const out = normalizePlaybookSettings({}, "tackle_11");
    expect(new Set(out.advancedCapabilities)).toEqual(
      new Set(["designed_qb_run", "handoff_chain", "rpo_read"]),
    );
  });

  it("falls back to the variant default when the field is not an array", () => {
    const out = normalizePlaybookSettings(
      { advancedCapabilities: "rpo_read" }, // wrong type
      "tackle_11",
    );
    // tackle_11 default has all three capabilities, so the fallback is
    // a non-empty list (proves the fallback path actually runs).
    expect(new Set(out.advancedCapabilities)).toEqual(
      new Set(["designed_qb_run", "handoff_chain", "rpo_read"]),
    );
  });

  it("treats an explicit empty array as an opt-out (NOT the variant default)", () => {
    const out = normalizePlaybookSettings(
      { advancedCapabilities: [] },
      "tackle_11",
    );
    expect(out.advancedCapabilities).toEqual([]);
  });
});
