import { describe, expect, it } from "vitest";

import { nextGroupName } from "./distribute";

// Add-only redistribution (owner decision 2026-07-03): a redistributed item
// lands as a NEW version-suffixed group, never touching the existing one.
describe("nextGroupName", () => {
  it("uses the title verbatim when unused", () => {
    expect(nextGroupName(["Warmups"], "Install 1")).toBe("Install 1");
  });

  it("suffixes (v2) when the title is taken", () => {
    expect(nextGroupName(["Install 1"], "Install 1")).toBe("Install 1 (v2)");
  });

  it("walks past existing versions to the next free suffix", () => {
    expect(nextGroupName(["Install 1", "Install 1 (v2)", "Install 1 (v3)"], "Install 1")).toBe(
      "Install 1 (v4)",
    );
  });

  it("fills gaps rather than colliding", () => {
    expect(nextGroupName(["Install 1", "Install 1 (v3)"], "Install 1")).toBe("Install 1 (v2)");
  });
});
