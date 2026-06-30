import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Seams: entitlement now resolves the user via the shared request-scoped
// helper and reads the row with the RLS anon client. Mock both, plus admin
// (imported for the service-role helpers in this module).
vi.mock("@/lib/supabase/request-user", () => ({ getRequestUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));

import { loadCurrentEntitlement } from "@/lib/billing/entitlement";
import { getRequestUser } from "@/lib/supabase/request-user";
import { createClient } from "@/lib/supabase/server";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const fakeClient = { from } as never;

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(fakeClient);
  maybeSingle.mockResolvedValue({ data: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadCurrentEntitlement", () => {
  it("returns null and runs no query when unauthenticated", async () => {
    vi.mocked(getRequestUser).mockResolvedValue({ kind: "ok", user: null });

    const result = await loadCurrentEntitlement();

    expect(result).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns null on an auth timeout (degrade to anonymous)", async () => {
    vi.mocked(getRequestUser).mockResolvedValue({ kind: "timeout" });

    expect(await loadCurrentEntitlement()).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("reads the entitlement row scoped to the user's id", async () => {
    vi.mocked(getRequestUser).mockResolvedValue({
      kind: "ok",
      user: { id: "user-7" } as never,
    });
    maybeSingle.mockResolvedValue({
      data: { tier: "coach", source: "stripe" },
    });

    const result = await loadCurrentEntitlement();

    expect(from).toHaveBeenCalledWith("user_entitlements");
    expect(eq).toHaveBeenCalledWith("user_id", "user-7");
    expect(result).toMatchObject({
      userId: "user-7",
      tier: "coach",
      source: "stripe",
    });
  });

  it("falls back to a free entitlement when the user has no row", async () => {
    vi.mocked(getRequestUser).mockResolvedValue({
      kind: "ok",
      user: { id: "user-9" } as never,
    });
    maybeSingle.mockResolvedValue({ data: null });

    const result = await loadCurrentEntitlement();

    expect(result).toMatchObject({
      userId: "user-9",
      tier: "free",
      source: "free",
    });
  });
});
