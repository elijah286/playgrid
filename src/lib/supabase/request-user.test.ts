import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Seams: the helper composes env detection + client creation + the
// time-bounded getUser. Mock all three so we can assert the contract
// (anonymous on missing env, user on success, timeout passthrough, never
// throws) without a live Supabase or a React request scope.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: vi.fn() }));
vi.mock("@/lib/supabase/get-user-with-timeout", () => ({
  getUserWithTimeout: vi.fn(),
}));

import { loadRequestUser } from "@/lib/supabase/request-user";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getUserWithTimeout } from "@/lib/supabase/get-user-with-timeout";

const fakeClient = { __brand: "supabase-client" } as never;

beforeEach(() => {
  vi.mocked(hasSupabaseEnv).mockReturnValue(true);
  vi.mocked(createClient).mockResolvedValue(fakeClient);
  vi.mocked(getUserWithTimeout).mockResolvedValue({ kind: "ok", user: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadRequestUser", () => {
  it("returns anonymous without touching Supabase when env is missing", async () => {
    vi.mocked(hasSupabaseEnv).mockReturnValue(false);

    const result = await loadRequestUser();

    expect(result).toEqual({ kind: "ok", user: null });
    expect(createClient).not.toHaveBeenCalled();
    expect(getUserWithTimeout).not.toHaveBeenCalled();
  });

  it("returns the authenticated user from getUserWithTimeout", async () => {
    const user = { id: "user-1", email: "coach@example.com" } as never;
    vi.mocked(getUserWithTimeout).mockResolvedValue({ kind: "ok", user });

    const result = await loadRequestUser();

    expect(result).toEqual({ kind: "ok", user });
    expect(getUserWithTimeout).toHaveBeenCalledOnce();
    expect(getUserWithTimeout).toHaveBeenCalledWith(fakeClient);
  });

  it("passes a timeout through so callers fall through as not-authed", async () => {
    vi.mocked(getUserWithTimeout).mockResolvedValue({ kind: "timeout" });

    const result = await loadRequestUser();

    expect(result).toEqual({ kind: "timeout" });
  });

  it("treats a thrown client as anonymous rather than throwing", async () => {
    vi.mocked(createClient).mockRejectedValue(new Error("no cookies"));

    await expect(loadRequestUser()).resolves.toEqual({
      kind: "ok",
      user: null,
    });
  });
});
