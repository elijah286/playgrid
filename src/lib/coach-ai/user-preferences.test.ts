/**
 * Tests for the preference rendering infrastructure.
 *
 * These verify the contract: given a set of preferences, the rendered
 * prompt block contains the right text in the right shape. They do
 * NOT verify Cal's behavioral compliance (whether Cal actually
 * APPLIES the preferences) — that's an LLM eval (see
 * `evals/scenarios/coach-preference-defender-label.scenario.ts`).
 *
 * Splitting the contracts this way lets the deterministic
 * infrastructure test run in CI on every push while the
 * behavioral test runs against a real LLM on demand.
 */

import { describe, expect, it } from "vitest";
import {
  renderPreferencesBlock,
  applyLabelAliasesToFence,
  applyLabelAliasesToSpec,
  type CoachPreference,
} from "./user-preferences";

describe("renderPreferencesBlock — defender label aliases", () => {
  it("renders a single defender label rename", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("Player label aliases");
    expect(block).toContain("FS → Free");
    expect(block).toContain("REQUIRED on every diagram");
  });

  it("groups multiple label renames under the same header", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
      { key: "defender_label_SS", value: "Strong", scope: "user", note: null },
      { key: "offense_label_Y", value: "TE", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("FS → Free");
    expect(block).toContain("SS → Strong");
    expect(block).toContain("Y → TE");
    // Single header line — not duplicated per rename.
    const headerCount = block.match(/Player label aliases/g)?.length ?? 0;
    expect(headerCount).toBe(1);
  });

  it("tags playbook-scoped preferences with '(this playbook only)'", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "playbook", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("FS → Free (this playbook only)");
  });
});

describe("renderPreferencesBlock — behavioral preferences", () => {
  it("renders behavioral preferences under a separate header", () => {
    const prefs: CoachPreference[] = [
      { key: "preferred_coverage", value: "Cover 3", scope: "user", note: null },
      { key: "preferred_front", value: "7v7 Zone", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("Other preferences");
    expect(block).toContain("preferred_coverage: Cover 3");
    expect(block).toContain("preferred_front: 7v7 Zone");
  });

  it("renders behavioral + label preferences together with both headers", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
      { key: "preferred_coverage", value: "Cover 3", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("Player label aliases");
    expect(block).toContain("Other preferences");
    expect(block).toContain("FS → Free");
    expect(block).toContain("preferred_coverage: Cover 3");
  });
});

describe("renderPreferencesBlock — edge cases", () => {
  it("returns an empty string for null input", () => {
    expect(renderPreferencesBlock(null)).toBe("");
  });

  it("returns an empty string for empty array", () => {
    expect(renderPreferencesBlock([])).toBe("");
  });

  it("preserves the preferences-section header so downstream prompt edits don't accidentally strip it", () => {
    // The header is what tells Cal these are PREFERENCES (not random
    // notes). If a future prompt refactor moves the rendering
    // around and drops the header, Cal might not realize the rules
    // apply. This test pins the header text.
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("Coach preferences");
    expect(block).toContain("apply these on every diagram");
  });
});

describe("applyLabelAliasesToFence — server-side label rename in tool fences", () => {
  // Task #36 (2026-05-25): the prompt block tells Cal to rename
  // labels but Cal doesn't reliably apply it. The structural fix is
  // to rename at the TOOL RESULT layer: compose_play / compose_defense /
  // place_defense apply the coach's prefs before returning the fence.
  // Cal then drops the renamed fence verbatim and the prose naturally
  // uses the alias (since that's what the fence shows).

  it("renames a defender player id when a matching defender_label_ pref is set", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
    ];
    const fence = {
      title: "Cover 3",
      variant: "flag_7v7",
      focus: "D",
      players: [
        { id: "FS", x: 0, y: 12, team: "D", role: "FS" },
        { id: "CB", x: -12, y: 5, team: "D", role: "CB" },
      ],
      routes: [],
      zones: [],
    };
    const out = applyLabelAliasesToFence(fence, prefs);
    expect(out.players[0].id).toBe("Free");
    // Role is also renamed (downstream renderers use role for tinting +
    // notes-from-spec).
    expect(out.players[0].role).toBe("Free");
    // Untouched players unchanged.
    expect(out.players[1].id).toBe("CB");
  });

  it("renames offense players too (offense_label_ keys)", () => {
    const prefs: CoachPreference[] = [
      { key: "offense_label_Y", value: "TE", scope: "user", note: null },
    ];
    const fence = {
      title: "Snag",
      variant: "flag_5v5",
      focus: "O",
      players: [
        { id: "Y", x: 4, y: -1, team: "O", role: "Y" },
      ],
      routes: [],
      zones: [],
    };
    const out = applyLabelAliasesToFence(fence, prefs);
    expect(out.players[0].id).toBe("TE");
  });

  it("renames `from` in routes so route entries stay linked to the renamed player", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
    ];
    const fence = {
      title: "Cover 3",
      variant: "flag_7v7",
      focus: "D",
      players: [{ id: "FS", x: 0, y: 12, team: "D", role: "FS" }],
      routes: [{ from: "FS", path: [[0, 18]], route_kind: "react_deep_third" }],
      zones: [],
    };
    const out = applyLabelAliasesToFence(fence, prefs);
    expect(out.players[0].id).toBe("Free");
    expect(out.routes[0].from).toBe("Free");
  });

  it("renames `ownerLabel` in zones (the defender who owns the zone)", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
    ];
    const fence = {
      title: "Cover 3",
      variant: "flag_7v7",
      focus: "D",
      players: [{ id: "FS", x: 0, y: 12, team: "D", role: "FS" }],
      routes: [],
      zones: [
        { kind: "rectangle", center: [0, 15], size: [10, 5], label: "Deep Middle", ownerLabel: "FS" },
      ],
    };
    const out = applyLabelAliasesToFence(fence, prefs);
    expect(out.zones[0].ownerLabel).toBe("Free");
  });

  it("returns the fence unchanged when no label aliases are set", () => {
    const prefs: CoachPreference[] = [
      { key: "preferred_coverage", value: "Cover 3", scope: "user", note: null },
    ];
    const fence = {
      title: "Snag",
      variant: "flag_5v5",
      focus: "O",
      players: [{ id: "Y", x: 4, y: -1, team: "O", role: "Y" }],
      routes: [],
      zones: [],
    };
    const out = applyLabelAliasesToFence(fence, prefs);
    expect(out.players[0].id).toBe("Y");
  });

  it("returns the fence unchanged when prefs is null or empty", () => {
    const fence = {
      title: "Snag",
      variant: "flag_5v5",
      focus: "O",
      players: [{ id: "FS", x: 0, y: 12, team: "D", role: "FS" }],
      routes: [],
      zones: [],
    };
    expect(applyLabelAliasesToFence(fence, null).players[0].id).toBe("FS");
    expect(applyLabelAliasesToFence(fence, []).players[0].id).toBe("FS");
  });

  it("does NOT rename a player whose id doesn't match any alias key", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
    ];
    const fence = {
      title: "Cover 3",
      variant: "flag_7v7",
      focus: "D",
      players: [
        { id: "CB2", x: -12, y: 5, team: "D", role: "CB2" },
      ],
      routes: [],
      zones: [],
    };
    const out = applyLabelAliasesToFence(fence, prefs);
    // CB2 doesn't match defender_label_FS — must stay CB2.
    expect(out.players[0].id).toBe("CB2");
  });

  it("matches the BASE label (strips trailing digits) — defender_label_CB renames CB AND CB2", () => {
    // The label conventions use "CB" / "CB2" for left / right corner.
    // A coach who sets defender_label_CB = "Corner" expects both
    // CB and CB2 to be renamed. The function strips trailing digits
    // when matching against the pref's key.
    const prefs: CoachPreference[] = [
      { key: "defender_label_CB", value: "Corner", scope: "user", note: null },
    ];
    const fence = {
      title: "Cover 3",
      variant: "flag_7v7",
      focus: "D",
      players: [
        { id: "CB", x: -12, y: 5, team: "D", role: "CB" },
        { id: "CB2", x: 12, y: 5, team: "D", role: "CB2" },
      ],
      routes: [],
      zones: [],
    };
    const out = applyLabelAliasesToFence(fence, prefs);
    expect(out.players[0].id).toBe("Corner");
    // CB2 → "Corner2" (preserves the suffix so the two corners stay
    // distinguishable in the diagram).
    expect(out.players[1].id).toBe("Corner2");
  });
});

describe("applyLabelAliasesToSpec — spec assignments use renamed player ids", () => {
  it("renames assignments[].player when a matching pref is set", () => {
    const prefs: CoachPreference[] = [
      { key: "offense_label_Y", value: "TE", scope: "user", note: null },
    ];
    const spec = {
      schemaVersion: 1 as const,
      variant: "flag_5v5" as const,
      title: "Snag",
      playType: "offense" as const,
      formation: { name: "Trips Bunch", strength: "right" as const },
      assignments: [
        { player: "Y", action: { kind: "route" as const, family: "Spot", depthYds: 5 } },
        { player: "X", action: { kind: "route" as const, family: "Go", depthYds: 18 } },
      ],
    };
    const out = applyLabelAliasesToSpec(spec, prefs);
    expect(out.assignments[0].player).toBe("TE");
    expect(out.assignments[1].player).toBe("X");
  });

  it("returns the spec unchanged when no aliases apply", () => {
    const spec = {
      schemaVersion: 1 as const,
      variant: "flag_5v5" as const,
      title: "Snag",
      playType: "offense" as const,
      formation: { name: "Trips Bunch", strength: "right" as const },
      assignments: [
        { player: "Y", action: { kind: "route" as const, family: "Spot", depthYds: 5 } },
      ],
    };
    expect(applyLabelAliasesToSpec(spec, null).assignments[0].player).toBe("Y");
    expect(applyLabelAliasesToSpec(spec, []).assignments[0].player).toBe("Y");
  });
});
