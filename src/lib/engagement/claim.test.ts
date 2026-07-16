import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimEngagementSlot,
  isWithinEngagementCooldown,
  engagementCutoffIso,
  ENGAGEMENT_COOLDOWN_DAYS,
} from "./claim";

/** Records the query chain so we can assert the claim is ONE conditional
 *  UPDATE and not a read-then-write. */
function mockAdmin(result: { data: unknown[] | null; error: unknown }) {
  const calls: { method: string; arg: unknown }[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["update", "eq", "or"]) {
    chain[method] = vi.fn((arg: unknown) => {
      calls.push({ method, arg });
      return chain;
    });
  }
  chain.select = vi.fn((arg: unknown) => {
    calls.push({ method: "select", arg });
    return Promise.resolve(result);
  });
  const from = vi.fn(() => chain);
  return { admin: { from } as unknown as SupabaseClient, calls, from, chain };
}

describe("claimEngagementSlot", () => {
  it("wins when the conditional update matches a row", async () => {
    const { admin } = mockAdmin({ data: [{ id: "u1" }], error: null });
    expect(await claimEngagementSlot(admin, "u1")).toBe(true);
  });

  it("loses when the update matches nothing — someone already claimed", async () => {
    const { admin } = mockAdmin({ data: [], error: null });
    expect(await claimEngagementSlot(admin, "u1")).toBe(false);
  });

  it("loses on a DB error rather than surfacing an ask", async () => {
    const { admin } = mockAdmin({ data: null, error: { message: "boom" } });
    expect(await claimEngagementSlot(admin, "u1")).toBe(false);
  });

  /**
   * The load-bearing test. The predecessor read last_engagement_prompt_at,
   * decided, then wrote it — so two asks mounting together both read the same
   * stale null and both showed. The claim must put the cooldown predicate in
   * the UPDATE's own WHERE, so Postgres re-checks it under the row lock and
   * exactly one caller matches.
   */
  it("checks the cooldown inside the UPDATE, not before it", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const { admin, calls } = mockAdmin({ data: [{ id: "u1" }], error: null });
    await claimEngagementSlot(admin, "u1", now);

    const methods = calls.map((c) => c.method);
    expect(methods).toEqual(["update", "eq", "or", "select"]);
    // No select/read preceding the update — the predicate rides along with it.
    expect(methods.indexOf("update")).toBeLessThan(methods.indexOf("select"));

    const or = calls.find((c) => c.method === "or");
    expect(or?.arg).toBe(
      `last_engagement_prompt_at.is.null,last_engagement_prompt_at.lt.${engagementCutoffIso(now)}`,
    );

    const update = calls.find((c) => c.method === "update");
    expect(update?.arg).toEqual({ last_engagement_prompt_at: now.toISOString() });
  });

  it("of two racing callers, exactly one wins", async () => {
    // Simulate Postgres: the first UPDATE matches, the second re-evaluates the
    // WHERE against the committed row and matches nothing.
    let claimed = false;
    const admin = {
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ["update", "eq", "or"]) chain[m] = () => chain;
        chain.select = () => {
          if (claimed) return Promise.resolve({ data: [], error: null });
          claimed = true;
          return Promise.resolve({ data: [{ id: "u1" }], error: null });
        };
        return chain;
      },
    } as unknown as SupabaseClient;

    const results = await Promise.all([
      claimEngagementSlot(admin, "u1"),
      claimEngagementSlot(admin, "u1"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("isWithinEngagementCooldown", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("is false when the coach has never been asked", () => {
    expect(isWithinEngagementCooldown(null, now)).toBe(false);
    expect(isWithinEngagementCooldown(undefined, now)).toBe(false);
  });

  it("is true inside the window", () => {
    const recent = new Date(now.getTime() - 2 * 86400000).toISOString();
    expect(isWithinEngagementCooldown(recent, now)).toBe(true);
  });

  it("is false once the window has passed", () => {
    const old = new Date(
      now.getTime() - (ENGAGEMENT_COOLDOWN_DAYS + 1) * 86400000,
    ).toISOString();
    expect(isWithinEngagementCooldown(old, now)).toBe(false);
  });

  it("agrees with the claim's own cutoff at the boundary", () => {
    const exactly = new Date(
      now.getTime() - ENGAGEMENT_COOLDOWN_DAYS * 86400000,
    ).toISOString();
    expect(isWithinEngagementCooldown(exactly, now)).toBe(false);
    expect(engagementCutoffIso(now)).toBe(exactly);
  });
});
