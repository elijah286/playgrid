/**
 * Security-focused tests for the scoped free-trial reset link.
 *
 * The whole point of this route is that ONLY one hardcoded test account can
 * reset its own counter. These pin: unauthenticated → 401, any other email →
 * 403 with NO write, the allowed email (case-insensitively) → 200 with a write
 * scoped to that user's own id.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/site/coach-cal-free-prompts-config", () => ({
  getCoachCalFreePromptAllowance: vi.fn(async () => 5),
}));

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { GET } from "./route";

function mockAuthUser(user: { id: string; email: string | null } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
  } as never);
}

/** Captures the update + eq calls so the test can assert scope. */
function mockAdmin(updateError: unknown = null) {
  const calls: { update?: unknown; eqCol?: string; eqVal?: unknown } = {};
  vi.mocked(createServiceRoleClient).mockReturnValue({
    from: () => ({
      update: (row: unknown) => {
        calls.update = row;
        return {
          eq: (col: string, val: unknown) => {
            calls.eqCol = col;
            calls.eqVal = val;
            return Promise.resolve({ error: updateError });
          },
        };
      },
    }),
  } as never);
  return calls;
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createServiceRoleClient).mockReset();
});

describe("GET /api/coach-cal/reset-free-trial", () => {
  it("401 when not signed in", async () => {
    mockAuthUser(null);
    const calls = mockAdmin();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(calls.update).toBeUndefined(); // no write
  });

  it("403 for any other email — and performs no write", async () => {
    mockAuthUser({ id: "u1", email: "someone.else@gmail.com" });
    const calls = mockAdmin();
    const res = await GET();
    expect(res.status).toBe(403);
    expect(calls.update).toBeUndefined();
  });

  it("resets for the allowed email (case-insensitive), scoped to that user's id", async () => {
    mockAuthUser({ id: "u-test", email: "Elijah.Kerry@emerson.com" });
    const calls = mockAdmin();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(calls.update).toEqual({ coach_cal_free_prompts_used: 0 });
    expect(calls.eqCol).toBe("id");
    expect(calls.eqVal).toBe("u-test"); // never a hardcoded/other id
  });

  it("500 when the reset write fails", async () => {
    mockAuthUser({ id: "u-test", email: "elijah.kerry@emerson.com" });
    mockAdmin({ message: "db down" });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
