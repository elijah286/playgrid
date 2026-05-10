/**
 * `normalizeInternalHref` — chat link routing.
 *
 * The renderer's `<a>` override uses this function to decide whether a
 * markdown link href is in-app (Link, in-place navigation) or external
 * (`<a target="_blank">`, new browser window). The bug that motivated
 * the helper: a coach reported clicking a Cal-linked play opened a
 * new Safari window instead of loading the play in the main pane.
 * Cause: Cal emitted `[Tampa 2 vs Noah](plays/<uuid>)` — bare path,
 * no leading slash — and the old single-line `isInternalHref` check
 * only matched `/`-prefixed paths. Fence cases covered here:
 *
 *   - Canonical relative path (`/plays/<id>/edit`) → unchanged
 *   - Bare path missing leading slash (`plays/<id>`) → promoted to
 *     `/plays/<id>/edit` so `<Link>` works
 *   - Same-origin absolute URL → path-stripped
 *   - Cross-origin absolute URL → null (external)
 *   - Protocol-relative `//evil.com/...` → null (external)
 *   - Empty / non-string-friendly inputs → null
 *
 * Cross-origin URLs and untrusted protocols intentionally fall through
 * to the external-link branch — `<Link>` should NEVER navigate to a
 * URL outside our origin without the `target="_blank"` guard.
 */

import { describe, expect, it } from "vitest";
import { normalizeInternalHref } from "./AssistantMessage";

const ORIGIN = "https://xogridmaker.com";
const UUID = "b38c3d28-30db-4537-b38c-51504ec54339";

describe("normalizeInternalHref — canonical paths", () => {
  it("passes through a canonical play edit path unchanged", () => {
    expect(normalizeInternalHref(`/plays/${UUID}/edit`, ORIGIN))
      .toBe(`/plays/${UUID}/edit`);
  });

  it("passes through a canonical playbook path unchanged", () => {
    expect(normalizeInternalHref(`/playbooks/${UUID}`, ORIGIN))
      .toBe(`/playbooks/${UUID}`);
  });

  it("preserves query string and hash on canonical paths", () => {
    expect(normalizeInternalHref(`/plays/${UUID}/edit?tab=notes#x`, ORIGIN))
      .toBe(`/plays/${UUID}/edit?tab=notes#x`);
  });
});

describe("normalizeInternalHref — bare-path repair (the prod bug)", () => {
  it("promotes a bare `plays/<uuid>` to the canonical edit path", () => {
    expect(normalizeInternalHref(`plays/${UUID}`, ORIGIN))
      .toBe(`/plays/${UUID}/edit`);
  });

  it("preserves an explicit subpath on a bare play path", () => {
    expect(normalizeInternalHref(`plays/${UUID}/edit`, ORIGIN))
      .toBe(`/plays/${UUID}/edit`);
  });

  it("promotes a bare `playbooks/<uuid>` to the canonical path", () => {
    expect(normalizeInternalHref(`playbooks/${UUID}`, ORIGIN))
      .toBe(`/playbooks/${UUID}`);
  });

  it("preserves a sub-tab path on a bare playbook path", () => {
    expect(normalizeInternalHref(`playbooks/${UUID}/calendar`, ORIGIN))
      .toBe(`/playbooks/${UUID}`);
  });
});

describe("normalizeInternalHref — same-origin absolute URLs", () => {
  it("strips a same-origin URL down to path", () => {
    expect(normalizeInternalHref(`${ORIGIN}/plays/${UUID}/edit`, ORIGIN))
      .toBe(`/plays/${UUID}/edit`);
  });

  it("preserves query + hash on a same-origin URL", () => {
    expect(normalizeInternalHref(`${ORIGIN}/plays/${UUID}/edit?x=1#y`, ORIGIN))
      .toBe(`/plays/${UUID}/edit?x=1#y`);
  });

  it("normalizes a same-origin homepage URL to /", () => {
    expect(normalizeInternalHref(ORIGIN, ORIGIN)).toBe("/");
  });

  it("normalizes a same-origin homepage URL WITH trailing slash to /", () => {
    expect(normalizeInternalHref(`${ORIGIN}/`, ORIGIN)).toBe("/");
  });
});

describe("normalizeInternalHref — external / unsafe", () => {
  it("returns null for a cross-origin URL", () => {
    expect(normalizeInternalHref("https://example.com/plays/x", ORIGIN)).toBeNull();
  });

  it("returns null for a protocol-relative URL", () => {
    expect(normalizeInternalHref("//evil.com/path", ORIGIN)).toBeNull();
  });

  it("returns null when current origin is unknown (SSR context)", () => {
    // No origin → can't safely promote an absolute URL. Bare-paths and
    // canonical paths still resolve; only the absolute-URL branch fails.
    expect(normalizeInternalHref(`https://xogridmaker.com/plays/${UUID}/edit`, null))
      .toBeNull();
    expect(normalizeInternalHref(`/plays/${UUID}/edit`, null))
      .toBe(`/plays/${UUID}/edit`);
    expect(normalizeInternalHref(`plays/${UUID}`, null))
      .toBe(`/plays/${UUID}/edit`);
  });

  it("returns null for an empty href", () => {
    expect(normalizeInternalHref("", ORIGIN)).toBeNull();
  });

  it("returns null for malformed inputs that don't match any pattern", () => {
    expect(normalizeInternalHref("foo bar", ORIGIN)).toBeNull();
    expect(normalizeInternalHref("mailto:hi@example.com", ORIGIN)).toBeNull();
    expect(normalizeInternalHref("javascript:alert(1)", ORIGIN)).toBeNull();
  });

  it("does NOT misclassify a path that LOOKS like 'plays/...' but isn't a UUID", () => {
    expect(normalizeInternalHref("plays/recommended-package", ORIGIN)).toBeNull();
    // Short id (< 8 chars) — too risky to assume it's a play; pass to external.
    expect(normalizeInternalHref("plays/abc", ORIGIN)).toBeNull();
  });
});
