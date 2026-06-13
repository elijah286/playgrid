/**
 * archivePlaybookAction — free-tier archive gate.
 *
 * Archiving is a Team Coach feature: an archived playbook still consumes the
 * single free playbook slot, so on the free plan it's a footgun (the slot
 * stays spent but the book looks put away). The action must REJECT archive
 * (is_archived=true) for free coaches WITHOUT writing, while still allowing
 * UNARCHIVE (so a downgraded coach can recover their books) and allowing
 * archive on Coach tier. The delete-or-keep dialog in the UI depends on this
 * gate; this test keeps it from silently regressing.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const userMock = vi.fn();
const singleMock = vi.fn();
const updateMock = vi.fn((_vals: unknown) => ({
  eq: () => Promise.resolve({ error: null }),
}));
const entitlementMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => userMock() },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => singleMock() }) }),
      update: (vals: unknown) => updateMock(vals),
    }),
  })),
}));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/billing/entitlement", () => ({
  getUserEntitlement: () => entitlementMock(),
}));

import { archivePlaybookAction } from "./playbooks";

const PLAYBOOK_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  userMock.mockReset();
  singleMock.mockReset();
  updateMock.mockClear();
  entitlementMock.mockReset();
  userMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  // A normal, non-default playbook by default; tier varies per test.
  singleMock.mockResolvedValue({ data: { is_default: false }, error: null });
});

describe("archivePlaybookAction — free-tier archive gate", () => {
  it("blocks archiving on the free tier and does not write", async () => {
    entitlementMock.mockResolvedValue({ tier: "free" });
    const res = await archivePlaybookAction(PLAYBOOK_ID, true);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res).toMatchObject({ needsUpgrade: true });
      expect(res.error).toMatch(/Team Coach/i);
    }
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows archiving on Coach tier", async () => {
    entitlementMock.mockResolvedValue({ tier: "coach" });
    const res = await archivePlaybookAction(PLAYBOOK_ID, true);
    expect(res.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ is_archived: true });
  });

  it("lets a free coach UNARCHIVE (recover a downgraded book)", async () => {
    entitlementMock.mockResolvedValue({ tier: "free" });
    const res = await archivePlaybookAction(PLAYBOOK_ID, false);
    expect(res.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ is_archived: false });
  });

  it("refuses to archive the default Inbox before any tier check", async () => {
    singleMock.mockResolvedValue({ data: { is_default: true }, error: null });
    entitlementMock.mockResolvedValue({ tier: "coach" });
    const res = await archivePlaybookAction(PLAYBOOK_ID, true);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Inbox/i);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
