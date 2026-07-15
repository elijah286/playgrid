import { describe, it, expect } from "vitest";
import { hideSiteHeaderOnMobile } from "./siteHeaderRoutes";

describe("hideSiteHeaderOnMobile", () => {
  // The global SiteHeader must STAY visible on mobile here — these surfaces
  // have no top banner of their own, so hiding it would strand the user
  // without a header (or push their back button under the iOS status bar).
  it.each([
    "/home",
    "/account",
    "/settings",
    "/formations",
    "/learn",
    "/learn/library/plays/mesh",
    "/pricing",
    "/coach-cal",
    "/coach-cal/chat",
    // Practice-plan editors render no replacement banner — keep the header.
    "/practice-plans/abc123/edit",
    "/practice-plans/abc123/print",
    // Playbook PRINT has only a back-link row; hiding the header would put
    // the back button under the status bar.
    "/playbooks/abc123/print",
    "/",
  ])("keeps the header on %s", (path) => {
    expect(hideSiteHeaderOnMobile(path)).toBe(false);
  });

  // Routes that render their own top banner (PlaybookHeader /
  // EditorPlaybookChrome) must HIDE the global header on mobile so the two
  // banners don't stack into a white bar + doubled safe-area band. This is
  // the regression the three-image mobile layout bug reported.
  it.each([
    "/playbooks/abc123",
    "/playbooks/abc123/plays",
    "/plays/new",
    "/plays/new-preview",
    "/plays/abc123/edit",
  ])("hides the header on %s", (path) => {
    expect(hideSiteHeaderOnMobile(path)).toBe(true);
  });
});
