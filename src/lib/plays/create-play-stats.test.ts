import { describe, it, expect } from "vitest";
import {
  nextSortOrder,
  nextWristbandCode,
  type PlayStatRow,
} from "./create-play-stats";

// Legacy reference implementations — the exact logic that lived inline in
// createPlayAction before the round-trip-collapse refactor. The new helpers
// must produce identical output; these mirror them so drift fails loudly.
function legacySort(rows: PlayStatRow[]): number {
  const nonArchived = rows.filter((r) => !r.is_archived);
  const top = nonArchived
    .map((r) => r.sort_order ?? -1)
    .sort((a, b) => b - a)[0];
  return (top ?? -1) + 1;
}
function legacyWristband(rows: PlayStatRow[]): string {
  const maxCode = rows
    .map((r) => parseInt((r.wristband_code as string | null) ?? "", 10))
    .filter((n): n is number => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0);
  return String(maxCode + 1).padStart(2, "0");
}

describe("nextSortOrder", () => {
  it("returns 0 for an empty playbook", () => {
    expect(nextSortOrder([])).toBe(0);
  });

  it("returns 0 when every play is archived", () => {
    expect(
      nextSortOrder([
        { sort_order: 5, is_archived: true },
        { sort_order: 9, is_archived: true },
      ]),
    ).toBe(0);
  });

  it("uses only non-archived plays for the max", () => {
    // Archived play has the higher sort_order but must be ignored.
    expect(
      nextSortOrder([
        { sort_order: 2, is_archived: false },
        { sort_order: 7, is_archived: true },
        { sort_order: 4, is_archived: false },
      ]),
    ).toBe(5);
  });

  it("tolerates null sort_order", () => {
    expect(
      nextSortOrder([
        { sort_order: null, is_archived: false },
        { sort_order: 0, is_archived: false },
      ]),
    ).toBe(1);
  });
});

describe("nextWristbandCode", () => {
  it("returns 01 for an empty playbook", () => {
    expect(nextWristbandCode([])).toBe("01");
  });

  it("counts archived plays' codes so numbers are never re-issued", () => {
    // The only remaining code lives on an archived play; it must still count.
    expect(
      nextWristbandCode([{ wristband_code: "07", is_archived: true }]),
    ).toBe("08");
  });

  it("ignores non-integer codes but keeps leading-digit ones", () => {
    expect(
      nextWristbandCode([
        { wristband_code: "HOT" },
        { wristband_code: "12abc" }, // parseInt → 12
        { wristband_code: "03" },
        { wristband_code: "" },
        { wristband_code: null },
      ]),
    ).toBe("13");
  });

  it("zero-pads to two digits", () => {
    expect(nextWristbandCode([{ wristband_code: "8" }])).toBe("09");
  });
});

describe("parity with the legacy inline implementations", () => {
  const fixtures: PlayStatRow[][] = [
    [],
    [{ sort_order: 0, wristband_code: "01", is_archived: false }],
    [
      { sort_order: 3, wristband_code: "04", is_archived: false },
      { sort_order: 9, wristband_code: "10", is_archived: true }, // archived
      { sort_order: 1, wristband_code: "HOT", is_archived: false }, // non-numeric
      { sort_order: null, wristband_code: null, is_archived: false },
      { sort_order: 2, wristband_code: "12abc", is_archived: true },
    ],
  ];

  it.each(fixtures.map((rows, i) => ({ i, rows })))(
    "fixture $i matches legacy sort + wristband",
    ({ rows }) => {
      expect(nextSortOrder(rows)).toBe(legacySort(rows));
      expect(nextWristbandCode(rows)).toBe(legacyWristband(rows));
    },
  );
});
