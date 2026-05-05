/**
 * Tests for the surgical-modify tools — modify_play_route and
 * add_defense_to_play. These tools exist so Cal stops re-authoring
 * entire diagrams when a coach asks for a small change. Every test
 * here pins the OFFENSE-PRESERVED contract: regardless of what the
 * coach changes, the offense players + routes from the prior fence
 * must be byte-for-byte identical (or with only the targeted route
 * changed, in modify_play_route's case) in the output.
 */

import { describe, expect, it } from "vitest";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";

// We import the tools by re-exposing them through a tiny test harness —
// tools.ts doesn't export the individual handlers, only BASE_TOOLS. Use
// dynamic import + name lookup so this test stays decoupled from any
// internal naming.
import { BASE_TOOLS } from "./tools";

function loadTool(name: string) {
  const tool = BASE_TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new Error(`tool ${name} not in BASE_TOOLS — registration regression`);
  return tool;
}

const MIN_CTX = {
  playbookId: null,
  playbookName: null,
  sportVariant: "tackle_11",
  gameLevel: null,
  sanctioningBody: null,
  ageDivision: null,
  playbookSettings: null,
  isAdmin: false,
  canEditPlaybook: false,
  mode: "normal" as const,
  timezone: null,
  playId: null,
  playName: null,
  playFormation: null,
  playDiagramText: null,
  playDiagramRecap: null,
};

/** Build a real play fence from the Flood Right skeleton — same path
 *  Cal would take in production. Return both the prior fence string
 *  and the parsed object so tests can compare. */
function buildPriorFence(): { fenceJson: string; parsed: any } {
  const skeleton = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
  if (!skeleton.ok) throw new Error("skeleton failed");
  const { diagram } = playSpecToCoachDiagram(skeleton.spec);
  const fence = {
    title: skeleton.spec.title ?? "Flood Right",
    variant: "tackle_11" as const,
    focus: "O" as const,
    ...diagram,
  };
  return { fenceJson: JSON.stringify(fence, null, 2), parsed: fence };
}

describe("modify_play_route — preserves offense, changes only the targeted route", () => {
  it("registered in BASE_TOOLS", async () => {
    const tool = loadTool("modify_play_route");
    expect(tool.def.name).toBe("modify_play_route");
  });

  it("deepens H's drag from 3yd to 6yd: offense identical, only H's route changed", async () => {
    const { fenceJson, parsed: prior } = buildPriorFence();
    const tool = loadTool("modify_play_route");
    const result = await tool.handler(
      { prior_play_fence: fenceJson, player: "H", set_depth_yds: 6 },
      MIN_CTX,
    );
    expect(result.ok, !result.ok ? result.error : undefined).toBe(true);
    if (!result.ok) return;
    // Extract the new fence JSON from the result string.
    const match = (result.result as string).match(/```play\n([\s\S]+?)\n```/);
    expect(match).not.toBeNull();
    const newFence = JSON.parse(match![1]);
    // Every player from the prior fence must still be present (same id, x, y, team).
    for (const p of prior.players) {
      const stillThere = newFence.players.find((np: any) => np.id === p.id);
      expect(stillThere, `player @${p.id} dropped`).toBeDefined();
      expect(stillThere.x).toBe(p.x);
      expect(stillThere.y).toBe(p.y);
      expect(stillThere.team).toBe(p.team);
    }
    // Every route EXCEPT H's must be byte-for-byte identical.
    for (const r of prior.routes) {
      const newR = newFence.routes.find((nr: any) => nr.from === r.from);
      expect(newR, `route from @${r.from} dropped`).toBeDefined();
      if (r.from !== "H") {
        expect(newR).toEqual(r);
      }
    }
    // H's route must have a new path with deeper geometry.
    const oldH = prior.routes.find((r: any) => r.from === "H");
    const newH = newFence.routes.find((r: any) => r.from === "H");
    expect(newH.path).not.toEqual(oldH.path);
    // The deepest waypoint of H's new path should be ~6yd from H's carrier y.
    const carrier = prior.players.find((p: any) => p.id === "H");
    const deepestY = Math.max(...newH.path.map(([, y]: [number, number]) => y - carrier.y));
    expect(deepestY).toBeGreaterThan(5.5);
    expect(deepestY).toBeLessThan(6.5);
  });

  it("swaps @Z's Corner for a Post: only Z's route changes", async () => {
    const { fenceJson, parsed: prior } = buildPriorFence();
    const tool = loadTool("modify_play_route");
    const result = await tool.handler(
      { prior_play_fence: fenceJson, player: "Z", set_family: "Post" },
      MIN_CTX,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const match = (result.result as string).match(/```play\n([\s\S]+?)\n```/);
    const newFence = JSON.parse(match![1]);
    const newZ = newFence.routes.find((r: any) => r.from === "Z");
    expect(newZ.route_kind).toBe("Post");
    // Players unchanged.
    expect(newFence.players.length).toBe(prior.players.length);
    // Only Z's route changed; everyone else's matches verbatim.
    for (const r of prior.routes) {
      if (r.from === "Z") continue;
      const newR = newFence.routes.find((nr: any) => nr.from === r.from);
      expect(newR).toEqual(r);
    }
  });

  it("rejects when the player has no existing route", async () => {
    const { fenceJson } = buildPriorFence();
    const tool = loadTool("modify_play_route");
    const result = await tool.handler(
      { prior_play_fence: fenceJson, player: "LT", set_depth_yds: 5 },
      MIN_CTX,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no existing route");
  });

  it("rejects when prior_play_fence is malformed JSON", async () => {
    const tool = loadTool("modify_play_route");
    const result = await tool.handler(
      { prior_play_fence: "{not valid json}", player: "H", set_depth_yds: 5 },
      MIN_CTX,
    );
    expect(result.ok).toBe(false);
  });

  // 2026-05-02 (fourth Flood-direction bug, surfaced by coach screenshot):
  // Cal called modify_play_route on @B's flat in a Flood Left play to fix
  // a small thing (depth/family). The recomputed path silently flipped @B
  // to go RIGHT, away from the flood. Cal's prose then said "@B swings
  // left into the flood" while the diagram showed the opposite.
  //
  // Root cause: modify_play_route's handler had its own duplicated copy
  // of the xSign math from specRenderer/play-mutations, and that copy
  // pre-dated the direction-override fix from f71bf44. It computed
  // `xSign = carrierX >= 0 ? 1 : -1`, ignoring the route's `direction`
  // field. B sits at x≈+2 in Spread Doubles regardless of strength side,
  // so xSign always came out +1 — flat goes RIGHT.
  //
  // Fix: route modify_play_route through applyRouteMod (the single
  // source of geometric truth per AGENTS.md Rule 10), which already
  // honors `direction`.
  it("preserves direction:'left' on @B's Flat across a depth-only edit (Flood Left regression)", async () => {
    // Build a Flood LEFT fence — B's Flat has direction:"left" baked in.
    const skeleton = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "left" });
    if (!skeleton.ok) throw new Error("skeleton failed");
    const { diagram } = playSpecToCoachDiagram(skeleton.spec);
    const priorFence = {
      title: "Flood Left",
      variant: "tackle_11" as const,
      focus: "O" as const,
      ...diagram,
    };
    const priorB = priorFence.routes?.find((r: any) => r.from === "B");
    expect(priorB, "Flood Left skeleton must produce a B route").toBeDefined();
    if (!priorB) return;
    // Sanity: prior B should already end on the LEFT (final x < 0).
    const priorFinalX = priorB.path[priorB.path.length - 1][0];
    expect(priorFinalX, "prior B final x should be negative (flood-left)").toBeLessThan(0);

    const tool = loadTool("modify_play_route");
    const result = await tool.handler(
      { prior_play_fence: JSON.stringify(priorFence, null, 2), player: "B", set_depth_yds: 4 },
      MIN_CTX,
    );
    expect(result.ok, !result.ok ? result.error : undefined).toBe(true);
    if (!result.ok) return;
    const match = (result.result as string).match(/```play\n([\s\S]+?)\n```/);
    expect(match).not.toBeNull();
    const newFence = JSON.parse(match![1]);
    const newB = newFence.routes.find((r: any) => r.from === "B");
    expect(newB, "B's route must still exist after modify").toBeDefined();
    const newFinalX = newB.path[newB.path.length - 1][0];
    expect(newFinalX, "modify_play_route must preserve B's leftward direction").toBeLessThan(0);
  });

  it("supports set_direction='right' to flip a route's lateral side", async () => {
    // Build the same Flood LEFT fence. Coach asks Cal to flip B to the
    // right (e.g. "actually run B to the right"). modify_play_route with
    // set_direction:"right" should produce a path ending on the right.
    const skeleton = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "left" });
    if (!skeleton.ok) throw new Error("skeleton failed");
    const { diagram } = playSpecToCoachDiagram(skeleton.spec);
    const priorFence = {
      title: "Flood Left",
      variant: "tackle_11" as const,
      focus: "O" as const,
      ...diagram,
    };
    const tool = loadTool("modify_play_route");
    const result = await tool.handler(
      { prior_play_fence: JSON.stringify(priorFence, null, 2), player: "B", set_direction: "right" },
      MIN_CTX,
    );
    expect(result.ok, !result.ok ? result.error : undefined).toBe(true);
    if (!result.ok) return;
    const match = (result.result as string).match(/```play\n([\s\S]+?)\n```/);
    const newFence = JSON.parse(match![1]);
    const newB = newFence.routes.find((r: any) => r.from === "B");
    const newFinalX = newB.path[newB.path.length - 1][0];
    expect(newFinalX, "set_direction:'right' must flip B to the right").toBeGreaterThan(0);
    expect(newB.direction).toBe("right");
  });
});

describe("add_defense_to_play — preserves offense, only adds defenders + zones", () => {
  it("registered in BASE_TOOLS", async () => {
    const tool = loadTool("add_defense_to_play");
    expect(tool.def.name).toBe("add_defense_to_play");
  });

  it("adds Cover 3 defenders to a Flood Right: offense byte-for-byte identical", async () => {
    const { fenceJson, parsed: prior } = buildPriorFence();
    const tool = loadTool("add_defense_to_play");
    const result = await tool.handler(
      {
        prior_play_fence: fenceJson,
        front: "4-3 Over",
        coverage: "Cover 3",
        strength: "right",
      },
      MIN_CTX,
    );
    expect(result.ok, !result.ok ? result.error : undefined).toBe(true);
    if (!result.ok) return;
    const match = (result.result as string).match(/```play\n([\s\S]+?)\n```/);
    const newFence = JSON.parse(match![1]);
    // Every offensive player from the prior fence must be unchanged.
    const priorOffense = prior.players.filter((p: any) => p.team !== "D");
    const newOffense = newFence.players.filter((p: any) => p.team !== "D");
    expect(newOffense).toEqual(priorOffense);
    // Every offensive route must be unchanged.
    expect(newFence.routes).toEqual(prior.routes);
    // Defenders added.
    const defenders = newFence.players.filter((p: any) => p.team === "D");
    expect(defenders.length).toBeGreaterThan(5);
  });

  it("strips and replaces existing defenders (vs Cover 3 → vs Cover 1)", async () => {
    const { fenceJson } = buildPriorFence();
    const tool = loadTool("add_defense_to_play");
    // First overlay Cover 3.
    const r1 = await tool.handler(
      { prior_play_fence: fenceJson, front: "4-3 Over", coverage: "Cover 3" },
      MIN_CTX,
    );
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const fence1 = (r1.result as string).match(/```play\n([\s\S]+?)\n```/)![1];
    // Now overlay Cover 1 onto the fence that already has Cover 3 defenders.
    const r2 = await tool.handler(
      { prior_play_fence: fence1, front: "4-3 Over", coverage: "Cover 1" },
      MIN_CTX,
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const finalFence = JSON.parse((r2.result as string).match(/```play\n([\s\S]+?)\n```/)![1]);
    // Defenders count is REPLACED, not duplicated. Just sanity-check we
    // don't have 2x defenders from both overlays.
    const defenders = finalFence.players.filter((p: any) => p.team === "D");
    expect(defenders.length).toBeLessThan(15); // 22 = doubled; 11 = correct
  });

  it("rejects an unknown front+coverage combo with a helpful list", async () => {
    const { fenceJson } = buildPriorFence();
    const tool = loadTool("add_defense_to_play");
    const result = await tool.handler(
      { prior_play_fence: fenceJson, front: "Made-Up Front", coverage: "Cover 99" },
      MIN_CTX,
    );
    expect(result.ok).toBe(false);
  });
});

describe("set_defender_assignment — surgical defender role change (Phase D5)", () => {
  /** Build a fence with offense + a defense already in place. */
  function fenceWithDefense(): string {
    const skeleton = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    if (!skeleton.ok) throw new Error("skeleton failed");
    const spec = { ...skeleton.spec, defense: { front: "4-3 Over", coverage: "Cover 3" as const } };
    const { diagram } = playSpecToCoachDiagram(spec);
    return JSON.stringify({ title: "test", variant: "tackle_11", focus: "O", ...diagram }, null, 2);
  }

  it("registered in BASE_TOOLS", () => {
    const tool = loadTool("set_defender_assignment");
    expect(tool.def.name).toBe("set_defender_assignment");
  });

  it("changes ML from a hook zone defender to a blitzer", async () => {
    const tool = loadTool("set_defender_assignment");
    const fence = fenceWithDefense();
    const result = await tool.handler(
      { prior_play_fence: fence, defender: "ML", action: { kind: "blitz", gap: "A" } },
      MIN_CTX,
    );
    expect(result.ok, !result.ok ? result.error : undefined).toBe(true);
    if (!result.ok) return;
    const match = (result.result as string).match(/```play\n([\s\S]+?)\n```/);
    expect(match).not.toBeNull();
    const newFence = JSON.parse(match![1]);
    const mlRoute = (newFence.routes ?? []).find((r: any) => r.from === "ML");
    expect(mlRoute, "ML should have a blitz route").toBeDefined();
    expect(mlRoute.path[0][1]).toBe(0);  // ends at LOS
  });

  it("man_match adds an arrow toward the target receiver", async () => {
    const tool = loadTool("set_defender_assignment");
    const fence = fenceWithDefense();
    const result = await tool.handler(
      { prior_play_fence: fence, defender: "CB", action: { kind: "man_match", target: "X" } },
      MIN_CTX,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const newFence = JSON.parse((result.result as string).match(/```play\n([\s\S]+?)\n```/)![1]);
    const cbRoute = (newFence.routes ?? []).find((r: any) => r.from === "CB");
    expect(cbRoute).toBeDefined();
  });

  it("rejects unknown defender", async () => {
    const tool = loadTool("set_defender_assignment");
    const fence = fenceWithDefense();
    const result = await tool.handler(
      { prior_play_fence: fence, defender: "GHOST", action: { kind: "blitz" } },
      MIN_CTX,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects man_match with unknown target", async () => {
    const tool = loadTool("set_defender_assignment");
    const fence = fenceWithDefense();
    const result = await tool.handler(
      { prior_play_fence: fence, defender: "CB", action: { kind: "man_match", target: "PHANTOM" } },
      MIN_CTX,
    );
    expect(result.ok).toBe(false);
  });

  it("preserves offense byte-for-byte", async () => {
    const fence = fenceWithDefense();
    const prior = JSON.parse(fence);
    const tool = loadTool("set_defender_assignment");
    const result = await tool.handler(
      { prior_play_fence: fence, defender: "ML", action: { kind: "blitz", gap: "A" } },
      MIN_CTX,
    );
    if (!result.ok) throw new Error(result.error);
    const newFence = JSON.parse((result.result as string).match(/```play\n([\s\S]+?)\n```/)![1]);
    const priorOffense = prior.players.filter((p: any) => p.team !== "D");
    for (const p of priorOffense) {
      const still = newFence.players.find((np: any) => np.id === p.id);
      expect(still).toBeDefined();
      expect(still.x).toBe(p.x);
      expect(still.y).toBe(p.y);
    }
  });
});
