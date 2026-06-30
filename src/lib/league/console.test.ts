import { describe, it, expect, vi } from "vitest";

// console.ts is server-only; vitest stubs `server-only`. We only exercise the
// pure aggregator here — the Supabase fetches are integration-tested manually.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import {
  summarizeRegistrations,
  buildPortfolioSummary,
  pickActiveOrg,
  type LeagueOrg,
} from "./console";
import type { RegistrationStatus } from "./registration";

const rows = (...statuses: RegistrationStatus[]) => statuses.map((status) => ({ status }));

describe("summarizeRegistrations", () => {
  it("counts an empty set as all zeros", () => {
    const s = summarizeRegistrations([]);
    expect(s.total).toBe(0);
    expect(s.unrostered).toBe(0);
    expect(s.needsReview).toBe(0);
    expect(s.byStatus.submitted).toBe(0);
  });

  it("tallies by status", () => {
    const s = summarizeRegistrations(
      rows("submitted", "submitted", "approved", "rostered", "waitlisted", "withdrawn"),
    );
    expect(s.total).toBe(6);
    expect(s.byStatus.submitted).toBe(2);
    expect(s.byStatus.approved).toBe(1);
    expect(s.byStatus.rostered).toBe(1);
    expect(s.byStatus.waitlisted).toBe(1);
    expect(s.byStatus.withdrawn).toBe(1);
  });

  it("counts approved + waitlisted as unrostered (the roster queue)", () => {
    const s = summarizeRegistrations(rows("approved", "waitlisted", "rostered", "submitted"));
    expect(s.unrostered).toBe(2);
  });

  it("counts submitted as needsReview", () => {
    const s = summarizeRegistrations(rows("submitted", "submitted", "approved"));
    expect(s.needsReview).toBe(2);
  });
});

describe("buildPortfolioSummary", () => {
  const NOW = Date.parse("2026-06-01T00:00:00.000Z");
  const iso = (deltaDays: number) => new Date(NOW + deltaDays * 86400000).toISOString();

  const input = {
    leagues: [
      { id: "A", name: "Waco Flag", sport: "football", settings: { variant: "flag", location: "Waco" } },
      { id: "B", name: "Austin Soccer", sport: "soccer", settings: { location: "Austin" } },
      { id: "C", name: "Austin 7v7", sport: "football", settings: { variant: "7v7", location: "Austin" } },
    ],
    teams: [
      { league_id: "A", head_coach_name: "Coach 1" },
      { league_id: "A", head_coach_name: null }, // coachless
      { league_id: "B", head_coach_name: "Coach 2" },
      { league_id: "C", head_coach_name: "Coach 3" },
    ],
    regs: [
      // A: 2 rostered (paid), 1 submitted (unpaid), 1 approved (unpaid)
      { league_id: "A", status: "rostered", payment_status: "paid", fee_cents: 5000 },
      { league_id: "A", status: "rostered", payment_status: "paid", fee_cents: 5000 },
      { league_id: "A", status: "submitted", payment_status: "unpaid", fee_cents: 5000 },
      { league_id: "A", status: "approved", payment_status: "unpaid", fee_cents: 5000 },
      // B: 1 rostered (paid)
      { league_id: "B", status: "rostered", payment_status: "paid", fee_cents: 8000 },
      // C: 8 rostered (paid)
      ...Array.from({ length: 8 }, () => ({ league_id: "C", status: "rostered", payment_status: "paid", fee_cents: 5000 })),
    ],
    windows: [
      { league_id: "A", is_open: true, closes_at: iso(3) }, // open + closing within 7d
      { league_id: "B", is_open: false, closes_at: iso(-5) }, // closed (past)
      { league_id: "C", is_open: false, closes_at: iso(-2) },
    ],
  };

  const s = buildPortfolioSummary(input, NOW);
  const byId = Object.fromEntries(s.leagues.map((l) => [l.id, l]));

  it("rolls up portfolio totals", () => {
    expect(s.totals.leagues).toBe(3);
    expect(s.totals.teams).toBe(4);
    expect(s.totals.teamsWithoutCoach).toBe(1);
    expect(s.totals.registrations).toBe(13);
    expect(s.totals.rostered).toBe(11);
    expect(s.totals.needsReview).toBe(1);
    expect(s.totals.unrostered).toBe(1);
    expect(s.totals.revenuePaidCents).toBe(2 * 5000 + 8000 + 8 * 5000);
    expect(s.totals.revenueUnpaidCents).toBe(2 * 5000);
    expect(s.totals.cities).toBe(2); // Waco, Austin
    expect(s.totals.sports).toBe(3); // flag, soccer, 7v7
    expect(s.totals.windowsClosingSoon).toBe(1); // only A (open + within 7d)
  });

  it("derives per-league status (open / rostering / setup)", () => {
    expect(byId.A.status).toBe("open"); // window open
    expect(byId.C.status).toBe("rostering"); // closed but 8/12 filled >= 0.45
    expect(byId.B.status).toBe("setup"); // closed, 1/12 filled
  });

  it("computes per-league fill + attention", () => {
    expect(byId.A.fillPct).toBeCloseTo(2 / 24, 5);
    expect(byId.A.attention).toBe(3); // 1 needsReview + 1 noCoach + 1 unrostered
    expect(byId.C.attention).toBe(0);
  });

  it("sorts leagues by registrations desc", () => {
    expect(s.leagues.map((l) => l.id)).toEqual(["C", "A", "B"]);
  });
});

describe("pickActiveOrg (organization context)", () => {
  const own: LeagueOrg = { ownerId: "me", label: "My organization", isOwn: true };
  const delegated: LeagueOrg = { ownerId: "buddy", label: "Buddy's organization", isOwn: false };

  it("returns null when there are no orgs", () => {
    expect(pickActiveOrg([], "anything")).toBeNull();
  });

  it("honors a valid wanted (cookie) org", () => {
    expect(pickActiveOrg([own, delegated], "buddy")?.ownerId).toBe("buddy");
  });

  it("falls back to the OWN org when the wanted id is unknown", () => {
    expect(pickActiveOrg([own, delegated], "ghost")?.ownerId).toBe("me");
    expect(pickActiveOrg([own, delegated], null)?.ownerId).toBe("me");
  });

  it("falls back to the first org when there is no own org (pure delegate)", () => {
    expect(pickActiveOrg([delegated], null)?.ownerId).toBe("buddy");
  });
});
