import { describe, expect, it } from "vitest";
import { activityLabel, collapseSteps } from "./calActivity";

describe("activityLabel", () => {
  it("maps known tools to curated labels", () => {
    expect(activityLabel("evaluate_matchup")).toBe("Evaluating the matchup");
    expect(activityLabel("compose_defense")).toBe("Composing a defense");
    expect(activityLabel("create_play")).toBe("Creating the play");
  });

  it("prettifies unmapped snake_case names as a fallback", () => {
    expect(activityLabel("do_something_new")).toBe("Do something new");
  });

  it("prettifies unmapped camelCase names as a fallback", () => {
    expect(activityLabel("doSomethingNew")).toBe("Do something new");
  });

  it("never returns an empty label", () => {
    expect(activityLabel("")).toBe("Working");
  });
});

describe("collapseSteps", () => {
  it("collapses consecutive identical tools into one counted row", () => {
    expect(collapseSteps(["evaluate_matchup", "evaluate_matchup", "evaluate_matchup"])).toEqual([
      { label: "Evaluating the matchup", count: 3 },
    ]);
  });

  it("keeps non-consecutive repeats as separate rows", () => {
    expect(collapseSteps(["compose_defense", "create_play", "compose_defense"])).toEqual([
      { label: "Composing a defense", count: 1 },
      { label: "Creating the play", count: 1 },
      { label: "Composing a defense", count: 1 },
    ]);
  });

  it("collapses on label, not raw name (mixed run stays one row)", () => {
    // Both map to distinct labels, so they should NOT merge.
    expect(collapseSteps(["compose_defense", "compose_defense", "create_play"])).toEqual([
      { label: "Composing a defense", count: 2 },
      { label: "Creating the play", count: 1 },
    ]);
  });

  it("returns an empty array for no tools", () => {
    expect(collapseSteps([])).toEqual([]);
  });
});
