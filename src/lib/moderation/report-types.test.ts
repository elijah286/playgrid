import { describe, expect, it } from "vitest";
import { validateReportInput, type ReportInput } from "./report-types";

const base: ReportInput = {
  contentType: "playbook_message",
  reason: "hate_or_harassment",
};

describe("validateReportInput", () => {
  it("accepts a valid report", () => {
    expect(validateReportInput(base)).toBeNull();
  });

  it("rejects an unknown content type", () => {
    expect(
      validateReportInput({ ...base, contentType: "bogus" as ReportInput["contentType"] }),
    ).toMatch(/content type/i);
  });

  it("rejects a missing or unknown reason", () => {
    expect(validateReportInput({ ...base, reason: "" })).toMatch(/reason/i);
    expect(validateReportInput({ ...base, reason: "not_a_reason" })).toMatch(/reason/i);
  });
});
