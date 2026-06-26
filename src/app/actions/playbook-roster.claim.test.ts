/**
 * claimRosterSlotAction — a joined player adopts a coach-added name.
 *
 * Context: joining a playbook now puts you on the roster automatically, but
 * when a coach has *pre-added* a named slot ("Jane Doe #12"), a joined player
 * named Jane should be able to merge into that slot instead of sitting as a
 * duplicate. That's this action. A coach links instantly (link_roster_entry);
 * a plain player submits a pending claim the coach approves
 * (submit_roster_claim). This viewer branch was previously unreachable from
 * the UI — the test pins the intended routing so it can't silently regress.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const userMock = vi.fn();
const rpcMock = vi.fn();
const membershipMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => userMock() },
    rpc: (name: string, args: unknown) => rpcMock(name, args),
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.is = () => chain;
      chain.maybeSingle = () => membershipMock();
      return chain;
    },
  })),
}));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/moderation/objectionable-text", () => ({
  objectionableNameError: () => null,
}));
vi.mock("@/lib/notifications/roster-claim-email", () => ({
  sendRosterClaimNotification: vi.fn(async () => undefined),
}));
vi.mock("@/lib/inbox/record-event", () => ({
  lookupDisplayName: vi.fn(async () => null),
  recordInboxEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/billing/seats", () => ({ ensureSeatsAvailable: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn(() => ({})) }));
vi.mock("@/lib/billing/entitlement", () => ({ getUserEntitlement: vi.fn(async () => null) }));
vi.mock("@/lib/billing/features", () => ({ tierAtLeast: vi.fn(() => false) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { claimRosterSlotAction } from "./playbook-roster";

const PB = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  userMock.mockReset();
  rpcMock.mockReset();
  membershipMock.mockReset();
  userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("claimRosterSlotAction", () => {
  it("requires sign-in", async () => {
    userMock.mockResolvedValue({ data: { user: null } });
    const res = await claimRosterSlotAction(PB, MEMBER, false);
    expect(res.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("a coach links instantly (no pending approval)", async () => {
    membershipMock.mockResolvedValue({ data: { role: "editor" }, error: null });
    rpcMock.mockResolvedValue({ data: null, error: null });
    const res = await claimRosterSlotAction(PB, MEMBER, false);
    expect(res).toEqual({ ok: true, pending: false });
    expect(rpcMock).toHaveBeenCalledWith(
      "link_roster_entry",
      expect.objectContaining({ p_member_id: MEMBER }),
    );
  });

  it("a plain player submits a pending claim", async () => {
    membershipMock.mockResolvedValue({ data: { role: "viewer" }, error: null });
    rpcMock.mockResolvedValue({ data: "claim-3", error: null });
    const res = await claimRosterSlotAction(PB, MEMBER, false);
    expect(res).toEqual({ ok: true, pending: true });
    expect(rpcMock).toHaveBeenCalledWith(
      "submit_roster_claim",
      expect.objectContaining({ p_member_id: MEMBER }),
    );
  });

  it("passes the parent/guardian mode through to the RPC", async () => {
    membershipMock.mockResolvedValue({ data: { role: "viewer" }, error: null });
    rpcMock.mockResolvedValue({ data: "claim-4", error: null });
    await claimRosterSlotAction(PB, MEMBER, true);
    expect(rpcMock).toHaveBeenCalledWith(
      "submit_roster_claim",
      expect.objectContaining({ p_member_id: MEMBER, p_as_manager: true }),
    );
  });
});
