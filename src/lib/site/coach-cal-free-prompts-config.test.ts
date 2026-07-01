/**
 * Tests for the free Coach Cal prompt allowance site setting.
 *
 * Pins the read path's clamp + default-on-error behavior and the write
 * path's clamp + DB-error propagation, in isolation from the DB.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  getCoachCalFreePromptAllowance,
  setCoachCalFreePromptAllowance,
  COACH_CAL_FREE_PROMPT_ALLOWANCE_DEFAULT,
} from "./coach-cal-free-prompts-config";

function mockClient(opts: {
  selectResult?: { data: unknown; error: unknown };
  upsertResult?: { error: unknown };
  onUpsert?: (row: unknown) => void;
} = {}) {
  const selectResult =
    opts.selectResult ?? { data: { coach_cal_free_prompt_allowance: 5 }, error: null };
  const upsertResult = opts.upsertResult ?? { error: null };
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(selectResult),
        }),
      }),
      upsert: (row: unknown) => {
        opts.onUpsert?.(row);
        return Promise.resolve(upsertResult);
      },
    }),
  };
}

describe("getCoachCalFreePromptAllowance", () => {
  it("returns the stored value", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: { coach_cal_free_prompt_allowance: 3 }, error: null } }) as never,
    );
    expect(await getCoachCalFreePromptAllowance()).toBe(3);
  });

  it("defaults when no row exists", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: null, error: null } }) as never,
    );
    expect(await getCoachCalFreePromptAllowance()).toBe(
      COACH_CAL_FREE_PROMPT_ALLOWANCE_DEFAULT,
    );
  });

  it("defaults on a DB error", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: null, error: { message: "boom" } } }) as never,
    );
    expect(await getCoachCalFreePromptAllowance()).toBe(
      COACH_CAL_FREE_PROMPT_ALLOWANCE_DEFAULT,
    );
  });

  it("defaults when the value is not a number", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: { coach_cal_free_prompt_allowance: "5" }, error: null } }) as never,
    );
    expect(await getCoachCalFreePromptAllowance()).toBe(
      COACH_CAL_FREE_PROMPT_ALLOWANCE_DEFAULT,
    );
  });

  it("clamps negatives to 0 and floors fractional values", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: { coach_cal_free_prompt_allowance: -4 }, error: null } }) as never,
    );
    expect(await getCoachCalFreePromptAllowance()).toBe(0);
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: { coach_cal_free_prompt_allowance: 7.9 }, error: null } }) as never,
    );
    expect(await getCoachCalFreePromptAllowance()).toBe(7);
  });

  it("defaults when the client constructor throws", async () => {
    vi.mocked(createServiceRoleClient).mockImplementation(() => {
      throw new Error("unreachable");
    });
    expect(await getCoachCalFreePromptAllowance()).toBe(
      COACH_CAL_FREE_PROMPT_ALLOWANCE_DEFAULT,
    );
  });
});

describe("setCoachCalFreePromptAllowance", () => {
  it("clamps and persists the clamped value", async () => {
    let saved: unknown = null;
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ onUpsert: (row) => { saved = row; } }) as never,
    );
    const result = await setCoachCalFreePromptAllowance(10.7);
    expect(result).toBe(10);
    expect(saved).toMatchObject({ coach_cal_free_prompt_allowance: 10 });
  });

  it("clamps out-of-range input to bounds", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(mockClient() as never);
    expect(await setCoachCalFreePromptAllowance(-99)).toBe(0);
    expect(await setCoachCalFreePromptAllowance(99999)).toBe(1000);
  });

  it("propagates DB errors", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ upsertResult: { error: { message: "permission denied" } } }) as never,
    );
    await expect(setCoachCalFreePromptAllowance(5)).rejects.toThrow(/permission denied/);
  });
});
