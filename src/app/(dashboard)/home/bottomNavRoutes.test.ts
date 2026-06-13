import { describe, it, expect } from "vitest";
import { isOwnBottomBarRoute } from "./bottomNavRoutes";

describe("isOwnBottomBarRoute", () => {
  // The global bottom nav (HomeBottomNav, mounted once in the root layout)
  // must SHOW on these. Resource/marketing surfaces used to strand authed
  // mobile users with no primary nav — that's the regression this guards.
  it.each([
    "/home",
    "/account",
    "/account/billing",
    "/settings",
    "/formations",
    "/learn",
    "/learn/library",
    "/learn/library/plays/mesh",
    "/learn/using-xo",
    "/pricing",
    "/about",
    "/faq",
    "/examples",
    "/tour",
    // Marketing landing for Coach Cal — only the /coach-cal/chat surface is
    // full-screen; the landing page should keep the nav.
    "/coach-cal",
    // Playbook PRINT keeps the global nav as its only way out (no toolbar of
    // its own; the back button can hide under the iOS status bar).
    "/playbooks/abc123/print",
    "/",
  ])("shows the global nav on %s", (path) => {
    expect(isOwnBottomBarRoute(path)).toBe(false);
  });

  // Routes that own their own bottom toolbar (or are intentionally
  // full-screen) must HIDE the global nav so we never stack two bars.
  it.each([
    "/playbooks/abc123",
    "/plays/new",
    "/plays/new-preview",
    "/plays/abc123/edit",
    "/practice-plans/abc123/edit",
    "/practice-plans/abc123/print",
    "/m/play/abc123",
    "/v/sometoken",
    "/coach-cal/chat",
  ])("hides the global nav on %s", (path) => {
    expect(isOwnBottomBarRoute(path)).toBe(true);
  });
});
