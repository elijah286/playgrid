import { describe, expect, it } from "vitest";

import {
  computeStandings,
  sportAllowsTies,
  sportStandingsConfig,
  type StandingsGame,
  type StandingsTeam,
} from "./standings";

const teams: StandingsTeam[] = [
  { id: "a", name: "Aardvarks", divisionId: "d1", divisionName: "U10" },
  { id: "b", name: "Bobcats", divisionId: "d1", divisionName: "U10" },
  { id: "c", name: "Cougars", divisionId: "d1", divisionName: "U10" },
  { id: "z", name: "Zebras", divisionId: null, divisionName: null },
];

const g = (
  home: string,
  away: string,
  hs: number | null,
  as: number | null,
  status = "final",
): StandingsGame => ({ homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, status });

describe("computeStandings", () => {
  it("counts wins/losses/ties and points, and only final games", () => {
    const games = [
      g("a", "b", 21, 14), // A beats B
      g("b", "c", 7, 7), // B ties C
      g("a", "c", 0, 0, "scheduled"), // ignored (not final)
      g("a", "c", 3, 3, null as unknown as string), // ignored (null score guard below)
    ];
    const out = computeStandings(teams, games);
    const u10 = out.find((d) => d.divisionId === "d1")!;
    const a = u10.rows.find((r) => r.teamId === "a")!;
    const b = u10.rows.find((r) => r.teamId === "b")!;
    const c = u10.rows.find((r) => r.teamId === "c")!;

    expect(a).toMatchObject({ played: 1, wins: 1, losses: 0, ties: 0, pointsFor: 21, pointsAgainst: 14, diff: 7 });
    expect(b).toMatchObject({ played: 2, wins: 0, losses: 1, ties: 1, pointsFor: 21, pointsAgainst: 28, diff: -7 });
    expect(c).toMatchObject({ played: 1, wins: 0, losses: 0, ties: 1, pointsFor: 7, pointsAgainst: 7, diff: 0 });
  });

  it("ranks by wins, then point differential", () => {
    const games = [
      g("a", "b", 30, 0), // A +30
      g("c", "b", 1, 0), // C wins by 1
      g("a", "c", 10, 9), // A beats C
    ];
    const out = computeStandings(teams, games);
    const u10 = out.find((d) => d.divisionId === "d1")!;
    // A: 2-0, C: 1-1, B: 0-2
    expect(u10.rows.map((r) => r.teamId)).toEqual(["a", "c", "b"]);
  });

  it("groups by division and puts ungrouped teams last", () => {
    const out = computeStandings(teams, []);
    expect(out[0].divisionName).toBe("U10");
    expect(out[out.length - 1].divisionId).toBeNull();
  });

  it("excludes cross-division games from standings", () => {
    const mixed: StandingsTeam[] = [
      { id: "a", name: "Aardvarks", divisionId: "d1", divisionName: "U10" },
      { id: "x", name: "Xenops", divisionId: "d2", divisionName: "U12" },
    ];
    const out = computeStandings(mixed, [g("a", "x", 28, 0)]);
    const u10 = out.find((d) => d.divisionId === "d1")!;
    const u12 = out.find((d) => d.divisionId === "d2")!;
    expect(u10.rows.find((r) => r.teamId === "a")!.played).toBe(0);
    expect(u12.rows.find((r) => r.teamId === "x")!.played).toBe(0);
  });

  it("skips games whose team no longer exists", () => {
    const games = [g("a", "ghost", 20, 0)];
    const out = computeStandings(teams, games);
    const a = out[0].rows.find((r) => r.teamId === "a")!;
    expect(a.played).toBe(0);
  });
});

describe("per-sport standings", () => {
  // Same games, three ways. A: 1W 1D, B: 1W 1L, C: 1D 1L.
  const games = [
    g("a", "b", 2, 1), // A beats B
    g("a", "c", 1, 1), // A draws C
    g("b", "c", 3, 0), // B beats C
  ];

  it("soccer ranks by table points (3-1-0), not wins/diff", () => {
    const out = computeStandings(teams, games, "soccer");
    const u10 = out.find((d) => d.divisionId === "d1")!;
    // A: 1W1D = 4 pts; B: 1W1L = 3 pts; C: 1D1L = 1 pt.
    expect(u10.rows.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(u10.rows.find((r) => r.teamId === "a")!.tablePoints).toBe(4);
    expect(u10.rows.find((r) => r.teamId === "b")!.tablePoints).toBe(3);
  });

  it("football ranks the SAME games differently (wins → diff): B's better diff wins the tie", () => {
    const out = computeStandings(teams, games, "football");
    const u10 = out.find((d) => d.divisionId === "d1")!;
    // A & B both 1 win; B's diff (+2) beats A's (+1).
    expect(u10.rows.map((r) => r.teamId)).toEqual(["b", "a", "c"]);
    expect(u10.rows.find((r) => r.teamId === "a")!.tablePoints).toBe(0); // no table for football
  });

  it("basketball ranks by win %, so a perfect record outranks more raw wins", () => {
    const bball = [
      g("a", "b", 50, 40), // A beats B → A 1-0
      g("b", "c", 60, 40), // B beats C
      g("b", "c", 55, 45), // B beats C again → B 2-1
    ];
    const out = computeStandings(teams, bball, "basketball");
    const u10 = out.find((d) => d.divisionId === "d1")!;
    // A 1-0 (1.000) outranks B 2-1 (.667) despite fewer wins.
    expect(u10.rows.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(u10.rows.find((r) => r.teamId === "a")!.winPct).toBe(1);
    expect(u10.rows.find((r) => r.teamId === "b")!.winPct).toBeCloseTo(2 / 3, 5);
  });

  it("encodes which sports allow ties", () => {
    expect(sportAllowsTies("football")).toBe(true);
    expect(sportAllowsTies("soccer")).toBe(true);
    expect(sportAllowsTies("basketball")).toBe(false);
    expect(sportAllowsTies("baseball")).toBe(false);
    expect(sportAllowsTies("volleyball")).toBe(false);
    expect(sportStandingsConfig("soccer").usesTablePoints).toBe(true);
    expect(sportStandingsConfig("basketball").usesTablePoints).toBe(false);
  });
});
