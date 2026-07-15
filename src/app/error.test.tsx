// @vitest-environment jsdom
/**
 * Root error boundary. Since the real /playbooks and /plays pages render
 * offline from the SW cache (local-first), the boundary no longer bounces
 * offline coaches to a separate /offline surface — it shows the normal error
 * UI, and "Go home" always targets the real (cache-backed) /home.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: vi.fn().mockReturnValue(false),
}));

import RouteError from "@/app/error";

const hrefSetter = vi.fn();

function stubLocation(pathname: string) {
  Object.defineProperty(window, "location", {
    value: {
      pathname,
      reload: vi.fn(),
      set href(v: string) {
        hrefSetter(v);
      },
      get href() {
        return "";
      },
    },
    writable: true,
  });
}

let container: HTMLDivElement;
let root: Root;

async function renderError() {
  const err = Object.assign(new Error("fetch failed"), { digest: "x" });
  await act(async () => {
    root.render(<RouteError error={err} reset={() => {}} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  hrefSetter.mockClear();
  stubLocation("/playbooks/pb-123");
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("RouteError", () => {
  it("shows the normal error UI (no bounce to a separate offline surface)", async () => {
    await renderError();
    expect(container.textContent).toContain("Something went wrong.");
    // It must NOT redirect anywhere on its own.
    expect(hrefSetter).not.toHaveBeenCalled();
  });

  it("'Go home' navigates to the real /home", async () => {
    await renderError();
    const goHome = [...container.querySelectorAll("button")].find((b) =>
      /go home/i.test(b.textContent || ""),
    );
    expect(goHome).toBeTruthy();
    await act(async () => {
      goHome!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(hrefSetter).toHaveBeenCalledWith("/home");
  });
});
