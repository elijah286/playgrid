/**
 * coach-cal-debug-access actions — site-admin-only grant/revoke/list of
 * per-account Coach Cal debug tools (download thread, copy JSON).
 *
 * Mirrors the league_organizers action shape. These tests pin the admin
 * gate (non-admins can't list/grant/revoke) and the grant-by-email flow
 * (unknown email is rejected with a clear message; a known email upserts
 * by user_id, not email, so re-granting is idempotent).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const roleMock = vi.fn();
const listRowsMock = vi.fn();
const listUsersMock = vi.fn();
const upsertMock = vi.fn((_vals: unknown, _opts: unknown) => Promise.resolve({ error: null }));
const deleteMock = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => getUserMock() },
    // profiles role check: .select("role").eq("id", uid).single()
    from: () => ({
      select: () => ({ eq: () => ({ single: () => roleMock() }) }),
    }),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => {
      if (table !== "cal_debug_accounts") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({ order: () => listRowsMock() }),
        upsert: upsertMock,
        delete: () => deleteMock(),
      };
    },
    auth: { admin: { listUsers: () => listUsersMock() } },
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import {
  grantCalDebugAccessAction,
  listCalDebugAccessAction,
  revokeCalDebugAccessAction,
} from "./coach-cal-debug-access";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const GRANTEE_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  getUserMock.mockReset();
  roleMock.mockReset();
  listRowsMock.mockReset();
  listUsersMock.mockReset();
  upsertMock.mockClear();
  deleteMock.mockClear();
  getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } } });
  roleMock.mockResolvedValue({ data: { role: "admin" } });
  listUsersMock.mockResolvedValue({
    data: {
      users: [
        { id: ADMIN_ID, email: "admin@example.com" },
        { id: GRANTEE_ID, email: "coach@example.com" },
      ],
    },
    error: null,
  });
});

describe("coach-cal-debug-access — admin gate", () => {
  it("rejects listing for a non-admin", async () => {
    roleMock.mockResolvedValue({ data: { role: "user" } });
    const res = await listCalDebugAccessAction();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Forbidden.");
    expect(res.items).toEqual([]);
  });

  it("rejects granting for a non-admin and does not write", async () => {
    roleMock.mockResolvedValue({ data: { role: "user" } });
    const res = await grantCalDebugAccessAction("coach@example.com");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Forbidden.");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects revoking for a non-admin and does not write", async () => {
    roleMock.mockResolvedValue({ data: { role: "user" } });
    const res = await revokeCalDebugAccessAction(GRANTEE_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Forbidden.");
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("rejects when signed out", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await listCalDebugAccessAction();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Not signed in.");
  });
});

describe("listCalDebugAccessAction", () => {
  it("resolves emails for every granted account", async () => {
    listRowsMock.mockResolvedValue({
      data: [
        { user_id: GRANTEE_ID, granted_by: ADMIN_ID, granted_at: "2026-07-01T00:00:00.000Z" },
      ],
      error: null,
    });
    const res = await listCalDebugAccessAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.items).toEqual([
        {
          userId: GRANTEE_ID,
          email: "coach@example.com",
          grantedAt: "2026-07-01T00:00:00.000Z",
          grantedByEmail: "admin@example.com",
        },
      ]);
    }
  });
});

describe("grantCalDebugAccessAction", () => {
  it("upserts by the matched user_id, keyed on user_id (idempotent re-grant)", async () => {
    const res = await grantCalDebugAccessAction("coach@example.com");
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      { user_id: GRANTEE_ID, granted_by: ADMIN_ID },
      { onConflict: "user_id" },
    );
  });

  it("matches email case-insensitively and trims whitespace", async () => {
    const res = await grantCalDebugAccessAction("  COACH@EXAMPLE.COM  ");
    expect(res.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      { user_id: GRANTEE_ID, granted_by: ADMIN_ID },
      { onConflict: "user_id" },
    );
  });

  it("rejects an email with no matching XO Gridmaker account and does not write", async () => {
    const res = await grantCalDebugAccessAction("nobody@example.com");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/No XO Gridmaker user/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects an empty email and does not write", async () => {
    const res = await grantCalDebugAccessAction("   ");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/enter an email/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("revokeCalDebugAccessAction", () => {
  it("deletes the account's grant row", async () => {
    const res = await revokeCalDebugAccessAction(GRANTEE_ID);
    expect(res.ok).toBe(true);
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
