import { describe, expect, it } from "vitest";

import { centralDayKey } from "./analytics-timezone";

describe("centralDayKey", () => {
  it("buckets an evening-Central timestamp to the Central day, not the next UTC day", () => {
    // 2026-05-27 22:00 CDT == 2026-05-28 03:00 UTC. The old UTC bucketing
    // produced the phantom "tomorrow" (May 28) point on the admin chart.
    const instant = new Date("2026-05-28T03:00:00Z");
    expect(centralDayKey(instant)).toBe("2026-05-27");
  });

  it("rolls to the next day only after Central midnight", () => {
    // 2026-05-28 00:30 CDT == 2026-05-28 05:30 UTC.
    const instant = new Date("2026-05-28T05:30:00Z");
    expect(centralDayKey(instant)).toBe("2026-05-28");
  });

  it("produces sortable YYYY-MM-DD keys", () => {
    expect(centralDayKey(new Date("2026-01-09T18:00:00Z"))).toBe("2026-01-09");
  });
});
