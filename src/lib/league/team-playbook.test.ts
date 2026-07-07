/**
 * League coach handoff — invite role pin (library plan, Phase 2).
 *
 * The handoff invites the coach onto the ORG-OWNED team playbook. The role
 * must be "editor": it's what the seat system counts (seats.ts) and what
 * accept_invite puts on the roster — and it must NEVER be "owner", or the
 * coach's free-playbook quota would absorb the league playbook and org
 * ownership would transfer. Companion to invites.acceptInvite.rolePin.test.ts
 * (which pins the SQL side).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn();
vi.mock("@/lib/notifications/coach-playbook-email", () => ({
  sendCoachPlaybookInvite: (...args: unknown[]) => sendEmailMock(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/data/playbook-copy", () => ({ copyPlaybookContents: vi.fn() }));
const ensureSeatsMock = vi.fn();
vi.mock("@/lib/billing/seats", () => ({
  ensureSeatsAvailable: (...args: unknown[]) => ensureSeatsMock(...args),
}));

import { leagueVariantToSportVariant, sendCoachHandoffInvite } from "./team-playbook";

const inserted: Record<string, unknown>[] = [];
const adminMock = {
  from: (table: string) => ({
    insert: (row: Record<string, unknown>) => {
      inserted.push({ table, ...row });
      return Promise.resolve({ error: null });
    },
  }),
};

beforeEach(() => {
  inserted.length = 0;
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ sent: true });
  ensureSeatsMock.mockReset();
  ensureSeatsMock.mockResolvedValue({ ok: true, usage: { used: 0, included: 3, purchased: 0, available: 3 } });
});

describe("sendCoachHandoffInvite", () => {
  it("invites as role=editor, single-use, email-bound — never owner", async () => {
    const r = await sendCoachHandoffInvite(
      adminMock as never,
      "operator-1",
      "pb-1",
      "Wolves 12U",
      "coach@example.com",
      "Austin 7v7",
      "operator-1",
    );
    expect(r.ok).toBe(true);
    const invite = inserted.find((i) => i.table === "playbook_invites");
    expect(invite).toBeDefined();
    expect(invite?.role).toBe("editor");
    expect(invite?.role).not.toBe("owner");
    expect(invite?.max_uses).toBe(1);
    expect(invite?.email).toBe("coach@example.com");
    expect(invite?.created_by).toBe("operator-1");
    // The emailed link is the invite-accept URL, not a copy link.
    const call = sendEmailMock.mock.calls[0]?.[0] as { claimUrl: string };
    expect(call.claimUrl).toMatch(/\/invite\//);
  });

  it("fails fast at send when the operator has no seats left", async () => {
    ensureSeatsMock.mockResolvedValue({
      ok: false,
      usage: { used: 3, included: 3, purchased: 0, available: 0 },
      error: "Coach seat limit reached.",
    });
    const r = await sendCoachHandoffInvite(
      adminMock as never,
      "operator-1",
      "pb-1",
      "Wolves 12U",
      "coach@example.com",
      "Austin 7v7",
      "operator-1",
    );
    expect(r.ok).toBe(false);
    expect(ensureSeatsMock).toHaveBeenCalledWith("operator-1", 1);
    expect(inserted.find((i) => i.table === "playbook_invites")).toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("leagueVariantToSportVariant", () => {
  it("maps league settings.variant to the coach product's format", () => {
    expect(leagueVariantToSportVariant("tackle")).toBe("tackle_11");
    expect(leagueVariantToSportVariant("flag")).toBe("flag_5v5");
    expect(leagueVariantToSportVariant("7v7")).toBe("flag_7v7");
    expect(leagueVariantToSportVariant(null)).toBe("flag_7v7");
  });
});
