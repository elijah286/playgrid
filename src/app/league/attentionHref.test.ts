import { describe, it, expect } from "vitest";

import { attentionHref } from "./page";
import type { PortfolioLeagueRow } from "@/lib/league/console";

function row(overrides: Partial<PortfolioLeagueRow> & { id: string }): PortfolioLeagueRow {
  return {
    name: "Test League",
    sport: "football",
    variant: null,
    location: "Waco",
    group: null,
    teams: 4,
    teamsWithoutCoach: 0,
    registrations: 10,
    rostered: 8,
    capacity: 40,
    fillPct: 0.2,
    needsReview: 0,
    unrostered: 0,
    revenuePaidCents: 0,
    revenueUnpaidCents: 0,
    isOpen: true,
    closesAt: null,
    status: "open",
    attention: 0,
    ...overrides,
  };
}

describe("attentionHref", () => {
  const singlePath = (id: string) => `/league/${id}/registration`;

  it("returns undefined when no league contributes", () => {
    const leagues = [row({ id: "a" }), row({ id: "b" })];
    expect(attentionHref(leagues, (l) => l.needsReview > 0, singlePath)).toBeUndefined();
  });

  it("links straight to the one contributing league", () => {
    const leagues = [row({ id: "a" }), row({ id: "b", needsReview: 3 })];
    expect(attentionHref(leagues, (l) => l.needsReview > 0, singlePath)).toBe("/league/b/registration");
  });

  it("links to the pre-filtered table when more than one league contributes", () => {
    const leagues = [row({ id: "a", needsReview: 1 }), row({ id: "b", needsReview: 3 })];
    expect(attentionHref(leagues, (l) => l.needsReview > 0, singlePath)).toBe("/league?attn=1#league-table");
  });
});
