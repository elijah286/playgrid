import { describe, it, expect } from "vitest";

import { sportTerms } from "./sportConfig";

describe("sportTerms", () => {
  it("uses football terminology (game / coach) by default", () => {
    const t = sportTerms("football");
    expect(t).toMatchObject({
      game: "game",
      games: "games",
      Game: "Game",
      Games: "Games",
      coach: "coach",
      coaches: "coaches",
      Coach: "Coach",
    });
  });

  it("uses soccer terminology and pluralizes 'match' correctly", () => {
    const t = sportTerms("soccer");
    expect(t.game).toBe("match");
    expect(t.games).toBe("matches"); // not "matchs"
    expect(t.Games).toBe("Matches");
    expect(t.coach).toBe("manager");
    expect(t.coaches).toBe("managers");
    expect(t.Coach).toBe("Manager");
    expect(t.score).toBe("goals");
  });

  it("falls back to defaults for unknown/empty sport", () => {
    expect(sportTerms(null).game).toBe("game");
    expect(sportTerms("quidditch").coach).toBe("coach");
  });
});
