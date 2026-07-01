/**
 * Tests for the per-user free Coach Cal prompt state.
 *
 * Verifies remaining = allowance - used (floored at 0), the hasRemaining
 * gate the stream route keys on, fail-open-to-zero on any error (never hand
 * out unlimited free Cal), and that recordFreePromptUsed maps the RPC result.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/site/coach-cal-free-prompts-config", () => ({
  getCoachCalFreePromptAllowance: vi.fn(),
}));

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCoachCalFreePromptAllowance } from "@/lib/site/coach-cal-free-prompts-config";
import {
  getCoachCalFreePromptState,
  recordFreePromptUsed,
} from "./coach-cal-free-prompts";

function mockClient(opts: {
  usedResult?: { data: unknown; error?: unknown };
  rpcResult?: { data: unknown; error: unknown };
} = {}) {
  const usedResult = opts.usedResult ?? { data: { coach_cal_free_prompts_used: 0 }, error: null };
  const rpcResult = opts.rpcResult ?? { data: 1, error: null };
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(usedResult),
        }),
      }),
    }),
    rpc: () => Promise.resolve(rpcResult),
  };
}

beforeEach(() => {
  vi.mocked(getCoachCalFreePromptAllowance).mockReset();
  vi.mocked(createServiceRoleClient).mockReset();
});

describe("getCoachCalFreePromptState", () => {
  it("computes remaining and hasRemaining when prompts are left", async () => {
    vi.mocked(getCoachCalFreePromptAllowance).mockResolvedValue(5);
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ usedResult: { data: { coach_cal_free_prompts_used: 2 }, error: null } }) as never,
    );
    const state = await getCoachCalFreePromptState("u1");
    expect(state).toEqual({ allowance: 5, used: 2, remaining: 3, hasRemaining: true });
  });

  it("floors remaining at 0 and reports no prompts when used >= allowance", async () => {
    vi.mocked(getCoachCalFreePromptAllowance).mockResolvedValue(5);
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ usedResult: { data: { coach_cal_free_prompts_used: 7 }, error: null } }) as never,
    );
    const state = await getCoachCalFreePromptState("u1");
    expect(state.remaining).toBe(0);
    expect(state.hasRemaining).toBe(false);
  });

  it("treats a missing profile row as 0 used", async () => {
    vi.mocked(getCoachCalFreePromptAllowance).mockResolvedValue(5);
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ usedResult: { data: null, error: null } }) as never,
    );
    const state = await getCoachCalFreePromptState("u1");
    expect(state.used).toBe(0);
    expect(state.remaining).toBe(5);
  });

  it("reports no prompts when the allowance is 0 (trial disabled)", async () => {
    vi.mocked(getCoachCalFreePromptAllowance).mockResolvedValue(0);
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ usedResult: { data: { coach_cal_free_prompts_used: 0 }, error: null } }) as never,
    );
    const state = await getCoachCalFreePromptState("u1");
    expect(state.hasRemaining).toBe(false);
  });

  it("fails closed (remaining 0) when the client throws", async () => {
    vi.mocked(getCoachCalFreePromptAllowance).mockResolvedValue(5);
    vi.mocked(createServiceRoleClient).mockImplementation(() => {
      throw new Error("unreachable");
    });
    const state = await getCoachCalFreePromptState("u1");
    expect(state).toEqual({ allowance: 0, used: 0, remaining: 0, hasRemaining: false });
  });
});

describe("recordFreePromptUsed", () => {
  it("returns the new count from the RPC", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ rpcResult: { data: 3, error: null } }) as never,
    );
    expect(await recordFreePromptUsed("u1")).toBe(3);
  });

  it("returns null on RPC error (non-fatal, fire-and-forget)", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ rpcResult: { data: null, error: { message: "boom" } } }) as never,
    );
    expect(await recordFreePromptUsed("u1")).toBeNull();
  });

  it("returns null when the client throws", async () => {
    vi.mocked(createServiceRoleClient).mockImplementation(() => {
      throw new Error("unreachable");
    });
    expect(await recordFreePromptUsed("u1")).toBeNull();
  });
});
