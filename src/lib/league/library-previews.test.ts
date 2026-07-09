import { describe, it, expect } from "vitest";

import { PREVIEW_PLAY_CAP, planSummaryFromDocument } from "./library-previews";

function lane(id: string, title: string, playerCount: number, los?: number) {
  return {
    id,
    orderIndex: 0,
    title,
    notes: "",
    diagram:
      playerCount > 0
        ? {
            id: `d-${id}`,
            document: {
              lineOfScrimmageY: los,
              layers: {
                players: Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}` })),
                routes: [],
              },
            },
          }
        : null,
  };
}

describe("planSummaryFromDocument", () => {
  it("summarizes blocks and extracts drill diagrams from lanes", () => {
    const doc = {
      schemaVersion: 1,
      totalDurationMinutes: 75,
      blocks: [
        {
          id: "b1",
          orderIndex: 0,
          startOffsetMinutes: 0,
          durationMinutes: 15,
          title: "Warm-up",
          notes: "",
          lanes: [lane("l1", "Dynamic stretch", 0)],
        },
        {
          id: "b2",
          orderIndex: 1,
          startOffsetMinutes: 15,
          durationMinutes: 30,
          title: "Stations",
          notes: "",
          lanes: [lane("l2", "Catching", 4, 0.3), lane("l3", "Flag pulling", 6)],
        },
      ],
    };
    const s = planSummaryFromDocument(doc);
    expect(s.totalDurationMinutes).toBe(75);
    expect(s.blocks).toEqual([
      { title: "Warm-up", durationMinutes: 15, laneCount: 1 },
      { title: "Stations", durationMinutes: 30, laneCount: 2 },
    ]);
    // Only lanes with a diagram that actually has players become drills.
    expect(s.drills.map((d) => d.name)).toEqual(["Catching", "Flag pulling"]);
    expect(s.drills[0].preview.lineOfScrimmageY).toBe(0.3);
    // Missing lineOfScrimmageY falls back to the standard 0.4.
    expect(s.drills[1].preview.lineOfScrimmageY).toBe(0.4);
  });

  it("caps extracted drills at the preview cap", () => {
    const doc = {
      totalDurationMinutes: 60,
      blocks: [
        {
          id: "b",
          orderIndex: 0,
          startOffsetMinutes: 0,
          durationMinutes: 60,
          title: "Mega block",
          notes: "",
          lanes: Array.from({ length: PREVIEW_PLAY_CAP + 3 }, (_, i) =>
            lane(`l${i}`, `Drill ${i}`, 2),
          ),
        },
      ],
    };
    expect(planSummaryFromDocument(doc).drills).toHaveLength(PREVIEW_PLAY_CAP);
  });

  it("tolerates empty, partial, and legacy documents", () => {
    expect(planSummaryFromDocument(null)).toEqual({
      totalDurationMinutes: 0,
      blocks: [],
      drills: [],
    });
    expect(planSummaryFromDocument({ blocks: "not-an-array" })).toEqual({
      totalDurationMinutes: 0,
      blocks: [],
      drills: [],
    });
    const noTitles = planSummaryFromDocument({
      blocks: [
        {
          id: "b",
          orderIndex: 0,
          startOffsetMinutes: 0,
          durationMinutes: 10,
          title: "",
          notes: "",
          lanes: [lane("l1", "", 3)],
        },
      ],
    });
    expect(noTitles.blocks[0].title).toBe("Block");
    expect(noTitles.drills[0].name).toBe("Drill");
  });
});
