/**
 * Lightweight tests for the Coach Cal version helper.
 *
 * Verifies the read path defaults to "v2" on any error AND validates
 * the write path's input check. The full DB integration is exercised
 * by the admin server action; these tests pin the contract of the
 * helper functions in isolation.
 */

import { describe, expect, it, vi } from "vitest";

// Mock the Supabase admin client BEFORE importing the module under
// test. The module reads `createServiceRoleClient` at call time
// (not at import time), so we can override it per test.
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  getCoachCalVersion,
  setCoachCalVersion,
} from "./coach-cal-version";

function mockClient(opts: {
  selectResult?: { data: unknown; error: unknown };
  upsertResult?: { error: unknown };
} = {}) {
  const selectResult = opts.selectResult ?? { data: { coach_cal_version: "v2" }, error: null };
  const upsertResult = opts.upsertResult ?? { error: null };
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(selectResult),
        }),
      }),
      upsert: () => Promise.resolve(upsertResult),
    }),
  };
}

describe("getCoachCalVersion", () => {
  it("returns 'v2' when DB row says v2", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: { coach_cal_version: "v2" }, error: null } }) as never,
    );
    expect(await getCoachCalVersion()).toBe("v2");
  });

  it("returns 'v1' when DB row says v1", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: { coach_cal_version: "v1" }, error: null } }) as never,
    );
    expect(await getCoachCalVersion()).toBe("v1");
  });

  it("returns 'v2' (default) when no row exists", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: null, error: null } }) as never,
    );
    expect(await getCoachCalVersion()).toBe("v2");
  });

  it("returns 'v2' (default) when the DB query errors", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: null, error: { message: "table missing" } } }) as never,
    );
    expect(await getCoachCalVersion()).toBe("v2");
  });

  it("returns 'v2' (default) when the client constructor throws", async () => {
    vi.mocked(createServiceRoleClient).mockImplementation(() => {
      throw new Error("supabase unreachable");
    });
    expect(await getCoachCalVersion()).toBe("v2");
  });

  it("returns 'v2' (default) when the row has an unexpected value", async () => {
    // E.g. a future enum value rolled back to a v2-only worker —
    // we treat anything not exactly 'v1' as 'v2' so an unknown value
    // doesn't accidentally enable v1's no-gate behavior.
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ selectResult: { data: { coach_cal_version: "v3" }, error: null } }) as never,
    );
    expect(await getCoachCalVersion()).toBe("v2");
  });
});

describe("setCoachCalVersion", () => {
  it("accepts 'v1'", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(mockClient() as never);
    await expect(setCoachCalVersion("v1")).resolves.toBeUndefined();
  });

  it("accepts 'v2'", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(mockClient() as never);
    await expect(setCoachCalVersion("v2")).resolves.toBeUndefined();
  });

  it("rejects anything else (type-safety + runtime guard)", async () => {
    await expect(
      // @ts-expect-error — testing the runtime guard
      setCoachCalVersion("v3"),
    ).rejects.toThrow(/Invalid Coach Cal version/);
  });

  it("propagates DB errors", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      mockClient({ upsertResult: { error: { message: "permission denied" } } }) as never,
    );
    await expect(setCoachCalVersion("v2")).rejects.toThrow(/permission denied/);
  });
});
