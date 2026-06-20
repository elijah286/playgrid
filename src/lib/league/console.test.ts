import { describe, it, expect, vi } from "vitest";

// console.ts is server-only; vitest stubs `server-only`. We only exercise the
// pure aggregator here — the Supabase fetches are integration-tested manually.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { summarizeRegistrations } from "./console";
import type { RegistrationStatus } from "./registration";

const rows = (...statuses: RegistrationStatus[]) => statuses.map((status) => ({ status }));

describe("summarizeRegistrations", () => {
  it("counts an empty set as all zeros", () => {
    const s = summarizeRegistrations([]);
    expect(s.total).toBe(0);
    expect(s.unrostered).toBe(0);
    expect(s.needsReview).toBe(0);
    expect(s.byStatus.submitted).toBe(0);
  });

  it("tallies by status", () => {
    const s = summarizeRegistrations(
      rows("submitted", "submitted", "approved", "rostered", "waitlisted", "withdrawn"),
    );
    expect(s.total).toBe(6);
    expect(s.byStatus.submitted).toBe(2);
    expect(s.byStatus.approved).toBe(1);
    expect(s.byStatus.rostered).toBe(1);
    expect(s.byStatus.waitlisted).toBe(1);
    expect(s.byStatus.withdrawn).toBe(1);
  });

  it("counts approved + waitlisted as unrostered (the roster queue)", () => {
    const s = summarizeRegistrations(rows("approved", "waitlisted", "rostered", "submitted"));
    expect(s.unrostered).toBe(2);
  });

  it("counts submitted as needsReview", () => {
    const s = summarizeRegistrations(rows("submitted", "submitted", "approved"));
    expect(s.needsReview).toBe(2);
  });
});
