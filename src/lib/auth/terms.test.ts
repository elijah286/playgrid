import { describe, expect, it } from "vitest";
import { termsAcceptanceNeeded } from "./terms";

describe("termsAcceptanceNeeded", () => {
  it("needs acceptance when no timestamp is recorded (new signup)", () => {
    expect(termsAcceptanceNeeded(null)).toBe(true);
    expect(termsAcceptanceNeeded(undefined)).toBe(true);
    expect(termsAcceptanceNeeded("")).toBe(true);
  });

  it("does not need acceptance once a timestamp exists (accepted or grandfathered)", () => {
    expect(termsAcceptanceNeeded("2026-06-18T00:00:00Z")).toBe(false);
  });
});
