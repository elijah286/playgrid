// @vitest-environment jsdom
/**
 * Pending-navigation affordance.
 *
 * Reported (2026-07-16): "there is ~500ms delay sometimes when I click a play
 * (online) to open it. For that split second I'm not sure if the software is
 * responsive. The same is true for the back button." Opening a play and going
 * back are both dynamic routes with a server round-trip, and nothing moved in
 * between — so a coach can't tell their tap registered and taps again.
 *
 * Next's `useLinkStatus` is the framework's sanctioned pending signal. The
 * invariant worth pinning: render NOTHING while idle (every tile mounts one of
 * these, and a stray spinner on an idle list would be worse than the gap).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let pending = false;
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending }),
}));

import { BackIcon, LinkPendingSpinner } from "./LinkPendingSpinner";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("LinkPendingSpinner", () => {
  it("renders NOTHING while idle", () => {
    pending = false;
    expect(html(<LinkPendingSpinner />)).toBe("");
    expect(html(<LinkPendingSpinner overlay />)).toBe("");
  });

  it("shows a spinner once the navigation is pending", () => {
    pending = true;
    expect(html(<LinkPendingSpinner />)).toContain("animate-spin");
  });

  it("overlay mode covers the tapped tile but stays non-interactive", () => {
    pending = true;
    const out = html(<LinkPendingSpinner overlay />);
    expect(out).toContain("animate-spin");
    expect(out).toContain("absolute");
    // Must not eat the tap it's reporting on.
    expect(out).toContain("pointer-events-none");
  });
});

describe("BackIcon", () => {
  it("is a plain arrow while idle", () => {
    pending = false;
    const out = html(<BackIcon className="size-5" />);
    expect(out).not.toContain("animate-spin");
    expect(out).toContain("size-5");
  });

  it("becomes a spinner while its own navigation is pending", () => {
    pending = true;
    expect(html(<BackIcon className="size-5" />)).toContain("animate-spin");
  });
});
