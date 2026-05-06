/**
 * Sanitization tests for the chat markdown renderer.
 *
 * The renderer's blast radius is high: every team chat post round-trips
 * through it. The tests below pin the specific properties that protect
 * users from XSS and from accidentally turning a chat into a block of
 * h1 typography:
 *
 *   - Raw HTML in a markdown body is escaped, never rendered.
 *   - Image markdown does not produce an <img> element (no attachments).
 *   - Heading markdown (`#`) renders as plain text, not h1-h6.
 *   - URLs in plain text become clickable <a target="_blank" rel="…">.
 *   - Bold / italic / code render with their semantic elements.
 *
 * Tests use renderToStaticMarkup so we don't need a DOM testing library
 * dep just for HTML inspection.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageMarkdown } from "./MessageMarkdown";

function renderHtml(body: string): string {
  return renderToStaticMarkup(<MessageMarkdown body={body} />);
}

describe("MessageMarkdown sanitization", () => {
  it("does not render raw HTML script tags", () => {
    const html = renderHtml("hi <script>alert(1)</script> bye");
    expect(html).not.toContain("<script>");
  });

  it("does not render image markdown as <img>", () => {
    const html = renderHtml("![logo](https://example.com/logo.png)");
    expect(html).not.toContain("<img");
  });

  it("renders headings as plain text, not h1-h6", () => {
    const html = renderHtml("# practice tomorrow");
    expect(html).not.toMatch(/<h[1-6]/);
    expect(html).toContain("practice tomorrow");
  });

  it("auto-links bare URLs with safe target+rel", () => {
    const html = renderHtml("see https://example.com for details");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toMatch(/rel="[^"]*noopener[^"]*"/);
  });

  it("renders bold with <strong>", () => {
    const html = renderHtml("**bold**");
    expect(html).toMatch(/<strong[^>]*>bold<\/strong>/);
  });

  it("renders italic with <em>", () => {
    const html = renderHtml("*italic*");
    expect(html).toMatch(/<em[^>]*>italic<\/em>/);
  });

  it("renders inline code with <code>", () => {
    const html = renderHtml("call `runWedge()` not `runStretch()`");
    expect((html.match(/<code/g) ?? []).length).toBe(2);
  });
});
