import { describe, it, expect } from "vitest";
import { __INTERNALS_FOR_TEST, CANCELLATION_FROM_EMAIL } from "./cancellation-feedback-email";

const { buildSubject, buildPlainText, buildHtml, formatPeriodEnd } = __INTERNALS_FOR_TEST;

describe("formatPeriodEnd", () => {
  it("renders a US-Central date label like 'June 2'", () => {
    // 2026-06-02T16:00:00Z is mid-morning US Central → still June 2 there.
    const d = new Date("2026-06-02T16:00:00Z");
    expect(formatPeriodEnd(d)).toBe("June 2");
  });

  it("falls back gracefully when the date is null", () => {
    expect(formatPeriodEnd(null)).toBe("the end of your current billing period");
  });
});

describe("buildSubject", () => {
  it("is the same line every time (no user-specific bits)", () => {
    expect(buildSubject()).toBe("Confirming your cancellation — and one quick ask");
  });
});

describe("buildPlainText", () => {
  const baseInput = { toEmail: "x@y.com", firstName: "Billy", periodEndDate: new Date("2026-06-02T16:00:00Z") };

  it("includes the first name in the greeting", () => {
    const txt = buildPlainText(baseInput);
    expect(txt).toMatch(/^Hi Billy,/);
  });

  it("falls back to 'there' when the first name is null", () => {
    const txt = buildPlainText({ ...baseInput, firstName: null });
    expect(txt).toMatch(/^Hi there,/);
  });

  it("mentions the formatted period-end date and the founder address", () => {
    const txt = buildPlainText(baseInput);
    expect(txt).toContain("through June 2");
    expect(txt).toContain("admin@xogridmaker.com");
    expect(txt).toContain("Founder, XO Gridmaker");
  });

  it("includes the 30-second feedback ask + the explicit no-pressure clause", () => {
    const txt = buildPlainText(baseInput);
    expect(txt).toContain("30 seconds");
    expect(txt).toContain("no hard feelings");
    expect(txt).toContain("not going to try to talk you out of it");
  });

  it("offers the five concrete buckets so reply cost is one word", () => {
    const txt = buildPlainText(baseInput);
    expect(txt).toContain("price");
    expect(txt).toContain("missing feature");
    expect(txt).toContain("bug");
    expect(txt).toContain("season");
  });
});

describe("buildHtml", () => {
  it("escapes HTML metacharacters in the first name", () => {
    const html = buildHtml({ toEmail: "x@y.com", firstName: "<script>", periodEndDate: null });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the founder sign-off and mailto link", () => {
    const html = buildHtml({ toEmail: "x@y.com", firstName: "Billy", periodEndDate: new Date("2026-06-02T16:00:00Z") });
    expect(html).toContain("Founder, XO Gridmaker");
    expect(html).toContain('href="mailto:admin@xogridmaker.com"');
    expect(html).toContain("June 2");
  });
});

describe("from address", () => {
  it("is locked to admin@xogridmaker.com so replies route to the founder", () => {
    expect(CANCELLATION_FROM_EMAIL).toContain("admin@xogridmaker.com");
  });
});
