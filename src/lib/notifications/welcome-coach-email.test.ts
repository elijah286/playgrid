import { describe, it, expect } from "vitest";
import { __INTERNALS_FOR_TEST, WELCOME_FROM_EMAIL } from "./welcome-coach-email";

const { buildSubject, buildPlainText, buildHtml } = __INTERNALS_FOR_TEST;

describe("buildSubject", () => {
  it("is the same line every time (no user-specific bits)", () => {
    expect(buildSubject()).toBe("Welcome to Team Coach — and a quick thank-you");
  });
});

describe("buildPlainText", () => {
  const baseInput = { toEmail: "x@y.com", firstName: "Billy" };

  it("includes the first name in the greeting", () => {
    const txt = buildPlainText(baseInput);
    expect(txt).toMatch(/^Hi Billy,/);
  });

  it("falls back to 'there' when the first name is null", () => {
    const txt = buildPlainText({ ...baseInput, firstName: null });
    expect(txt).toMatch(/^Hi there,/);
  });

  it("thanks the coach for the purchase and names the plan", () => {
    const txt = buildPlainText(baseInput);
    expect(txt).toContain("Thank you for upgrading to Team Coach");
  });

  it("frames it as a new product the founder is excited about", () => {
    const txt = buildPlainText(baseInput);
    expect(txt).toContain("new product");
  });

  it("makes the feedback / questions ask explicit", () => {
    const txt = buildPlainText(baseInput);
    expect(txt).toContain("Questions, concerns, feature ideas");
    expect(txt).toContain("hit reply");
  });

  it("signs off as Coach Eli, founder, with the founder address", () => {
    const txt = buildPlainText(baseInput);
    expect(txt).toContain("— Coach Eli");
    expect(txt).toContain("Founder, XO Gridmaker");
    expect(txt).toContain("admin@xogridmaker.com");
  });
});

describe("buildHtml", () => {
  it("escapes HTML metacharacters in the first name", () => {
    const html = buildHtml({ toEmail: "x@y.com", firstName: "<script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the founder sign-off and mailto link", () => {
    const html = buildHtml({ toEmail: "x@y.com", firstName: "Billy" });
    expect(html).toContain("Coach Eli");
    expect(html).toContain("Founder, XO Gridmaker");
    expect(html).toContain('href="mailto:admin@xogridmaker.com"');
  });
});

describe("from address", () => {
  it("is locked to admin@xogridmaker.com so replies route to the founder", () => {
    expect(WELCOME_FROM_EMAIL).toContain("admin@xogridmaker.com");
  });
});
