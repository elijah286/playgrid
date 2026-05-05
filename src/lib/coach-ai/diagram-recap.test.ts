import { describe, expect, it } from "vitest";
import { recapCoachDiagram } from "./diagram-recap";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";

function diagram(overrides: Partial<CoachDiagram> = {}): CoachDiagram {
  return {
    title: "Test",
    variant: "flag_7v7",
    players: [],
    routes: [],
    ...overrides,
  };
}

describe("recapCoachDiagram", () => {
  it("emits one line per player with alignment", () => {
    const out = recapCoachDiagram(
      diagram({
        players: [
          { id: "Q", x: 0, y: -4.5, team: "O" },
          { id: "X", x: 5.2, y: -4.5, team: "O" },
        ],
      }),
    );
    expect(out).toMatch(/@Q .*offense.*x=0\.0, y=-4\.5/);
    expect(out).toMatch(/@X .*offense.*x=5\.2, y=-4\.5/);
  });

  it("flags players with no route assigned", () => {
    const out = recapCoachDiagram(
      diagram({
        players: [{ id: "C", x: 0, y: 0, team: "O" }],
      }),
    );
    expect(out).toContain("no route assigned");
  });

  it("includes route_kind when declared", () => {
    const out = recapCoachDiagram(
      diagram({
        players: [{ id: "X", x: 5, y: -4.5, team: "O" }],
        routes: [{ from: "X", path: [[5, 12]], route_kind: "go" }],
      }),
    );
    expect(out).toContain('route_kind="go"');
    expect(out).toContain("path ends at x=5.0, y=12.0");
  });

  it("explicitly notes when route_kind is missing — so Cal can't infer one from prior turns", () => {
    const out = recapCoachDiagram(
      diagram({
        players: [{ id: "X", x: 5, y: -4.5, team: "O" }],
        routes: [{ from: "X", path: [[5, 10.8]] }],
      }),
    );
    expect(out).toContain("no route_kind declared");
    expect(out).toContain("path ends at x=5.0, y=10.8");
  });

  it("annotates curved paths", () => {
    const out = recapCoachDiagram(
      diagram({
        players: [{ id: "Z", x: -8, y: -2, team: "O" }],
        routes: [{ from: "Z", path: [[-8, -1], [-5, 0.7]], curve: true }],
      }),
    );
    expect(out).toContain("curved path");
    expect(out).toContain("(2 waypoints)");
  });

  it("captures pre-snap motion endpoint", () => {
    const out = recapCoachDiagram(
      diagram({
        players: [{ id: "H", x: 12, y: 0, team: "O" }],
        routes: [{
          from: "H",
          path: [[5, 14]],
          motion: [[8, -1], [5, -1]],
          route_kind: "go",
        }],
      }),
    );
    expect(out).toContain("pre-snap motion ends at x=5.0, y=-1.0");
  });

  it("flags routes with no post-snap path (motion-only)", () => {
    const out = recapCoachDiagram(
      diagram({
        players: [{ id: "Y", x: -3, y: 0, team: "O" }],
        routes: [{ from: "Y", path: [], motion: [[-1, 0]] }],
      }),
    );
    expect(out).toContain("no post-snap path");
  });

  it("renders coverage zones with label, kind, center, size", () => {
    const out = recapCoachDiagram(
      diagram({
        players: [{ id: "FS", x: 0, y: 12, team: "D" }],
        routes: [],
        zones: [{
          kind: "rectangle",
          center: [-5, 6],
          size: [8, 6],
          label: "hook",
          ownerLabel: "WL",
        }],
      }),
    );
    expect(out).toContain("Coverage zones:");
    expect(out).toContain('"hook"');
    expect(out).toContain("(rectangle owned by @WL)");
    expect(out).toContain("centered at x=-5.0, y=6.0");
    expect(out).toContain("size 8.0 × 6.0 yds");
  });

  it("includes role in parens when distinct from id (post-suffix duplicates)", () => {
    const out = recapCoachDiagram(
      diagram({
        players: [
          { id: "Z",  role: "Z", x: -8, y: 0, team: "O" },
          { id: "Z2", role: "Z", x: 8,  y: 0, team: "O" },
        ],
      }),
    );
    expect(out).toContain('@Z2 ("Z")');
    expect(out).not.toContain('@Z ("Z")');
  });
});
