import { describe, expect, it } from "vitest";
import { buildDefenseNotes } from "./defense-notes";

// Faithful to the 2026-07-04 "Cover 2 vs Pull Right" fence: 7 defenders, 5
// underneath zones (Flat/Hook) + 2 deep halves.
const COVER2_DIAGRAM = {
  players: [
    { id: "CB", team: "D", x: -12, y: 5 },
    { id: "HL", team: "D", x: -5, y: 5 },
    { id: "HM", team: "D", x: 0, y: 5 },
    { id: "HR", team: "D", x: 5, y: 5 },
    { id: "CB2", team: "D", x: 12, y: 5 },
    { id: "FS", team: "D", x: -7, y: 12 },
    { id: "SS", team: "D", x: 7, y: 12 },
    // offense left in for realism — must be ignored (team !== D)
    { id: "Q", team: "O", x: 0, y: -3 },
  ],
  zones: [
    { label: "Flat L", center: [-12, 5] as [number, number] },
    { label: "Hook L", center: [-5, 5] as [number, number] },
    { label: "Hook M", center: [0, 5] as [number, number] },
    { label: "Hook R", center: [5, 5] as [number, number] },
    { label: "Flat R", center: [12, 5] as [number, number] },
    { label: "Deep 1/2 L", center: [-7.5, 17] as [number, number] },
    { label: "Deep 1/2 R", center: [7.5, 17] as [number, number] },
  ],
};

describe("buildDefenseNotes", () => {
  it("projects rich notes for a known coverage (Cover 2 vs Pull Right)", () => {
    const notes = buildDefenseNotes({ playName: "Cover 2 vs Pull Right", diagram: COVER2_DIAGRAM, offenseName: "Pull Right" });
    // Coverage summary from the hand-authored profile.
    expect(notes).toContain("Cover 2 vs Pull Right");
    expect(notes).toContain("Two deep safeties split the field");
    // Deep vs underneath split, with the nearest defender named per zone.
    expect(notes).toMatch(/Deep:.*FS \(Deep 1\/2 L\)/);
    expect(notes).toMatch(/Deep:.*SS \(Deep 1\/2 R\)/);
    expect(notes).toMatch(/Underneath:.*CB \(Flat L\)/);
    expect(notes).toContain("Hook M");
    // Coaching reads (soft spots).
    expect(notes).toContain("Watch for");
    expect(notes).toContain("honey hole");
    expect(notes.length).toBeGreaterThan(100);
  });

  it("prefers a catalog ownerLabel over nearest-defender when present", () => {
    const notes = buildDefenseNotes({
      playName: "Cover 3",
      diagram: {
        players: [{ id: "M", team: "D", x: 9, y: 5 }],
        zones: [{ label: "Deep 1/3 L", center: [-10, 16], ownerLabel: "LC" }],
      },
      offenseName: null,
    });
    expect(notes).toContain("LC (Deep 1/3 L)"); // ownerLabel wins, not the far-away M
  });

  it("never returns blank for an unknown coverage name (still describes defenders)", () => {
    const notes = buildDefenseNotes({
      playName: "Junk Robber Zero",
      diagram: { players: [{ id: "SS", team: "D", x: 0, y: 8 }, { id: "CB", team: "D", x: -10, y: 5 }], zones: [] },
      offenseName: "Trips Right",
    });
    expect(notes).toContain("Junk Robber Zero");
    expect(notes).toContain("SS");
    expect(notes).toContain("CB");
    expect(notes.trim().length).toBeGreaterThan(0);
  });

  it("handles a man coverage with no zones", () => {
    const notes = buildDefenseNotes({
      playName: "Cover 1 vs Mesh",
      diagram: { players: [{ id: "CB", team: "D" }, { id: "FS", team: "D" }], zones: [] },
      offenseName: "Mesh",
    });
    expect(notes).toContain("Cover 1"); // recognized
    expect(notes).toContain("free safety"); // from the Cover 1 summary
    expect(notes).toContain("Defenders:"); // no zones -> defender list
  });
});
