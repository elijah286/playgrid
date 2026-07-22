import { describe, expect, it } from "vitest";
import { parsePlaySpec } from "@/domain/play/spec";
import { sportProfileForVariant } from "@/domain/play/factory";
import { buildVariantMismatchDraft } from "./run-import";
import type { PlayExtraction } from "./schema";

/** A 5-player read (C + Q + 3 skill) — a flag_5v5 play. Imported into a
 *  7v7 playbook it's a 2-skill shortfall: the mismatch gate's territory. */
function fivePlayerExtraction(): PlayExtraction {
  return {
    title: "Play 1",
    players: [
      { label: "X", side: "left", orderFromLeft: 1, onLos: true, backfield: false },
      { label: "C", side: "center", orderFromLeft: 2, onLos: true, backfield: false },
      { label: "Q", side: "center", orderFromLeft: 3, onLos: false, backfield: true },
      { label: "Y", side: "right", orderFromLeft: 4, onLos: true, backfield: false },
      { label: "Z", side: "right", orderFromLeft: 5, onLos: false, backfield: false },
    ],
    formation: { name: "Spread", confidence: "med" },
    assignments: [
      { player: "X", kind: "route", family: "Go", confidence: "high" },
      { player: "Y", kind: "route", family: "Hitch", confidence: "med" },
      { player: "Z", kind: "route", family: "Slant", confidence: "med" },
    ],
  };
}

/** An 8-player read (C + Q + 6 skill) — a count no supported variant has. */
function eightPlayerExtraction(): PlayExtraction {
  const ext = fivePlayerExtraction();
  ext.players = [
    { label: "X", side: "left", orderFromLeft: 1, onLos: true, backfield: false },
    { label: "W", side: "left", orderFromLeft: 2, onLos: false, backfield: false },
    { label: "T", side: "left", orderFromLeft: 3, onLos: true, backfield: false },
    { label: "C", side: "center", orderFromLeft: 4, onLos: true, backfield: false },
    { label: "Q", side: "center", orderFromLeft: 5, onLos: false, backfield: true },
    { label: "A", side: "right", orderFromLeft: 6, onLos: false, backfield: false },
    { label: "Y", side: "right", orderFromLeft: 7, onLos: true, backfield: false },
    { label: "Z", side: "right", orderFromLeft: 8, onLos: false, backfield: false },
  ];
  return ext;
}

describe("buildVariantMismatchDraft", () => {
  it("infers the play's own variant by player count and drafts a valid spec against it", () => {
    const draft = buildVariantMismatchDraft(fivePlayerExtraction(), "flag_7v7", "Play 1");

    // The mismatch names the playbook it didn't fit AND the inferred format.
    expect(draft.mismatch.variant).toBe("flag_7v7");
    expect(draft.mismatch.inferredVariant).toBe("flag_5v5");
    expect(draft.mismatch.photoPlayers).toBe(5);

    // A draft exists, built for the INFERRED variant (never forced onto the
    // playbook's 7-slot roster), and passes the strict runtime schema the
    // save route enforces.
    expect(draft.spec).not.toBeNull();
    expect(draft.spec!.variant).toBe("flag_5v5");
    expect(parsePlaySpec(draft.spec!).success).toBe(true);

    // Three skill slots for the three read receivers — the play's real size.
    expect(draft.mapping).not.toBeNull();
    expect(draft.mapping!.length).toBe(3);
    expect(sportProfileForVariant("flag_5v5").offensePlayerCount).toBe(draft.mismatch.photoPlayers);
  });

  it("returns no draft when the player count matches no supported variant", () => {
    const draft = buildVariantMismatchDraft(eightPlayerExtraction(), "flag_7v7", "Play 1");
    expect(draft.mismatch.photoPlayers).toBe(8);
    expect(draft.mismatch.inferredVariant).toBeNull();
    expect(draft.spec).toBeNull();
    expect(draft.mapping).toBeNull();
    expect(draft.warnings).toBeNull();
  });
});
