/**
 * End-to-end regression: Cover 2 overlay produces REACTIVE defender
 * movement on a flag_7v7 Flood play.
 *
 * Surfaced 2026-05-29: a coach asked Cal to "install a cover 2 defense and
 * show me how the defenders should move as this play develops" over a Flood
 * Right play. The defenders moved generically — every defender got an
 * identical short static zone-drop — instead of reacting to the routes.
 *
 * Root cause: flag_7v7 had reactor patterns for Tampa 2 / Cover 3 / Cover 1
 * / Cover 0 but NOT Cover 2, so `findReactorPattern("flag_7v7", "Cover 2",
 * "Flood")` returned null and `compose_defense` fell through to the
 * universal `applyZoneDrops` fallback (one static arrow per defender).
 *
 * The fix seeds f7-cover-2 reactor patterns (catalog-only, Rule 3). This
 * test pins the END-TO-END behavior the coach actually sees: overlaying
 * Cover 2 on a Flood play yields reactor routes (route_kind `react_*`) for
 * the key defenders, not just uniform zone-drops.
 *
 * It builds the offense by hand (NOT via compose_play) so it stays
 * independent of the unrelated tackle_11 Mesh-compose regression that
 * currently reddens compose-tools.test.ts.
 */

import { describe, expect, it } from "vitest";
import { BASE_TOOLS } from "./tools";

function loadTool(name: string) {
  const tool = BASE_TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new Error(`tool ${name} not in BASE_TOOLS — registration regression`);
  return tool;
}

const FLAG_7V7_CTX = {
  playbookId: null,
  playbookName: null,
  sportVariant: "flag_7v7" as const,
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
  threadId: null,
  userId: null,
};

/**
 * A faithful flag_7v7 Flood Right fence — the coach's reported scenario.
 * Strong right: @Z go (deep), @S out/sail (intermediate), @B flat (low);
 * backside @X post, @H drag. Canonical 7v7 roster {X, Z, S, H, B, C, QB} —
 * no @Y. Title contains "Flood" so detectConceptFromTitle resolves it.
 */
function buildFloodRightFence(): string {
  return JSON.stringify({
    title: "Flood Right",
    variant: "flag_7v7",
    players: [
      { id: "QB", x: 0, y: -3, team: "O" },
      { id: "C", x: 0, y: 0, team: "O" },
      { id: "X", x: -12, y: 0, team: "O" },
      { id: "H", x: -6, y: 0, team: "O" },
      { id: "S", x: 6, y: 0, team: "O" },
      { id: "Z", x: 12, y: 0, team: "O" },
      { id: "B", x: 2, y: -2, team: "O" },
    ],
    // Route paths follow the canonical fence convention: waypoints AFTER the
    // carrier's start position (the converter prepends the start). Leading
    // with the start position would trip the sanitizer's duplicate-waypoint
    // drop, mutate the offense, and (correctly) fail compose_defense's Rule 11
    // byte-preservation gate.
    routes: [
      { from: "Z", path: [[12, 18]], tip: "arrow" },          // go (deep)
      { from: "S", path: [[6, 11], [14, 12]], tip: "arrow" }, // out / sail
      { from: "B", path: [[10, 2]], tip: "arrow" },           // flat
      { from: "X", path: [[-6, 14]], tip: "arrow" },          // post
      { from: "H", path: [[4, 4]], tip: "arrow" },            // drag
    ],
    zones: [],
  });
}

describe("compose_defense — Cover 2 overlay reacts to Flood (2026-05-29 regression)", () => {
  it("overlaying Cover 2 on a Flood play produces reactor routes, not just static zone-drops", async () => {
    const tool = loadTool("compose_defense");
    const r = await tool.handler(
      { front: "7v7 Zone", coverage: "Cover 2", on_play: buildFloodRightFence() },
      FLAG_7V7_CTX,
    );
    expect(r.ok, r.ok ? "" : `compose_defense failed: ${r.error}`).toBe(true);
    if (!r.ok) return;

    const m = /```play\n([\s\S]*?)\n```/.exec(r.result);
    expect(m, "no play fence in compose_defense result").not.toBeNull();
    if (!m) return;
    const fence = JSON.parse(m[1]) as {
      players: Array<{ id: string; team: string }>;
      routes: Array<{ from: string; route_kind?: string }>;
    };

    // Offense preserved.
    const offenseIds = fence.players.filter((p) => p.team !== "D").map((p) => p.id).sort();
    expect(offenseIds).toEqual(["B", "C", "H", "QB", "S", "X", "Z"]);

    // The bug: every defender route was a static zone_drop. The fix: at
    // least the key reactors carry a `react_*` route_kind.
    const reactRoutes = fence.routes.filter((rt) => rt.route_kind?.startsWith("react_"));
    expect(
      reactRoutes.length,
      `expected reactive defender routes; got kinds: ${fence.routes.map((rt) => rt.route_kind).join(", ")}`,
    ).toBeGreaterThanOrEqual(3);

    // The three teaching-point reactors fire on the right triggers:
    //   SS carries @Z's go (deep half), HR undercuts @S's sail, CB2 caps @B's flat.
    const kinds = new Set(reactRoutes.map((rt) => rt.route_kind));
    expect(kinds.has("react_carry_vertical")).toBe(true); // SS → Z
    expect(kinds.has("react_jump_route")).toBe(true);      // HR → S
    expect(kinds.has("react_follow_to_flat")).toBe(true);  // CB2 → B
  });

  it("surfaces the Cover 2 vs Flood reactor cues in the tool result for Cal's prose", async () => {
    const tool = loadTool("compose_defense");
    const r = await tool.handler(
      { front: "7v7 Zone", coverage: "Cover 2", on_play: buildFloodRightFence() },
      FLAG_7V7_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The reactor note names the pattern and lists per-defender cues so Cal
    // can describe the read in coach language (not raw coordinates).
    expect(r.result).toMatch(/Reactor pattern \(Cover 2 vs Flood\)/);
    expect(r.result).toMatch(/@SS|@HR|@CB2/);
  });
});
