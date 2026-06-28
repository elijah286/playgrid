/**
 * evaluate_matchup tool goldens.
 *
 * The tool is the thin Cal-facing projection of coverageProfiles.evaluateMatchup
 * (+ the defensiveReactors read). It must: be registered, require a coverage,
 * detect the concept from the on_play title, and surface a grounded verdict +
 * soft spots + alternatives WITHOUT inventing matchup claims.
 */
import { describe, expect, it } from "vitest";
import { BASE_TOOLS, type ToolContext } from "./tools";

function loadTool(name: string) {
  const tool = BASE_TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new Error(`tool ${name} not in BASE_TOOLS — registration regression`);
  return tool;
}

const CTX: ToolContext = {
  playbookId: null,
  playbookName: null,
  sportVariant: "flag_7v7",
  gameLevel: null,
  sanctioningBody: null,
  ageDivision: null,
  playbookSettings: null,
  isAdmin: false,
  canEditPlaybook: false,
  mode: "normal",
  timezone: null,
  playId: null,
  playName: null,
  playFormation: null,
  playDiagramText: null,
  playDiagramRecap: null,
  threadId: null,
  userId: null,
};

function offenseFence(title: string): string {
  return JSON.stringify({
    title,
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
    routes: [],
  });
}

describe("evaluate_matchup tool", () => {
  it("is registered in BASE_TOOLS", () => {
    expect(BASE_TOOLS.some((t) => t.def.name === "evaluate_matchup")).toBe(true);
  });

  it("requires a coverage", async () => {
    const r = await loadTool("evaluate_matchup").handler({}, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/coverage is required/i);
  });

  it("grades a beater play as a good matchup and names soft spots", async () => {
    const r = await loadTool("evaluate_matchup").handler(
      { coverage: "Cover 2", on_play: offenseFence("Smash Right") },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatch(/VERDICT: Good matchup/i);
    expect(r.result).toMatch(/Smash/);
    expect(r.result).toMatch(/SOFT/);
    expect(r.result).toMatch(/honey hole|behind the corner/i);
  });

  it("includes the hand-authored reactor read for a known concept × coverage", async () => {
    // flag_7v7 has a Tampa 2 vs Mesh reactor pattern — its read should surface.
    const r = await loadTool("evaluate_matchup").handler(
      { coverage: "Tampa 2", on_play: offenseFence("Mesh Right") },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatch(/HOW Tampa 2 DEFENDS Mesh/i);
    expect(r.result).toMatch(/VERDICT: Contested/i);
  });

  it("suggests catalog alternatives that beat the coverage", async () => {
    const r = await loadTool("evaluate_matchup").handler(
      { coverage: "Cover 3", on_play: offenseFence("Mesh Right") },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatch(/ALTERNATIVES THAT BEAT Cover 3/i);
    expect(r.result).toMatch(/Curl-Flat|Slant-Flat/);
  });

  it("still grades the coverage with no play attached (coverage-only)", async () => {
    const r = await loadTool("evaluate_matchup").handler({ coverage: "Cover 3" }, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatch(/SOFT/);
    expect(r.result).toMatch(/ALTERNATIVES/);
  });

  it("degrades gracefully on an unknown coverage (no bluffing)", async () => {
    const r = await loadTool("evaluate_matchup").handler(
      { coverage: "Cover 9 Banana", on_play: offenseFence("Mesh Right") },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result).toMatch(/Unclear|don't have a structural profile/i);
  });
});
