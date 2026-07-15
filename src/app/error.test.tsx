// @vitest-environment jsdom
/**
 * Offline safety net for the ROOT error boundary (2026-07-15 "Something
 * went wrong on playbook tap"): an offline native coach who errors on the
 * ONLINE playbook route (/playbooks/<id>) — e.g. any residual connectivity
 * misdetection routing them there — must be redirected to the downloaded
 * copy instead of being stranded on an error screen with no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/native/isNativeApp", () => ({ isNativeApp: vi.fn() }));
vi.mock("@/lib/offline/connectivity", () => ({ probeConnectivity: vi.fn() }));
vi.mock("@/lib/offline/db", () => ({ getCachedPlaybookMeta: vi.fn() }));

import RouteError from "@/app/error";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { probeConnectivity } from "@/lib/offline/connectivity";
import { getCachedPlaybookMeta } from "@/lib/offline/db";

const replaceMock = vi.fn();

function setPath(pathname: string) {
  Object.defineProperty(window, "location", {
    value: { pathname, replace: replaceMock, reload: vi.fn(), href: "" },
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
  // let the fire-and-forget redirect chain settle
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  replaceMock.mockClear();
  vi.mocked(isNativeApp).mockReturnValue(true);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("RouteError offline redirect", () => {
  it("redirects to /offline/<id> when native + offline + playbook downloaded", async () => {
    setPath("/playbooks/pb-123");
    vi.mocked(getCachedPlaybookMeta).mockResolvedValue({ id: "pb-123" } as never);
    vi.mocked(probeConnectivity).mockResolvedValue(false); // offline

    await renderError();

    await vi.waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/offline/pb-123"),
    );
    // Quiet placeholder while navigating — never the error headline.
    expect(container.textContent).not.toContain("Something went wrong.");
  });

  it("shows the normal error UI when the probe says we're online", async () => {
    setPath("/playbooks/pb-123");
    vi.mocked(getCachedPlaybookMeta).mockResolvedValue({ id: "pb-123" } as never);
    vi.mocked(probeConnectivity).mockResolvedValue(true); // online crash

    await renderError();

    expect(container.textContent).toContain("Something went wrong.");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not redirect when the playbook is not downloaded", async () => {
    setPath("/playbooks/pb-123");
    vi.mocked(getCachedPlaybookMeta).mockResolvedValue(null as never);
    vi.mocked(probeConnectivity).mockResolvedValue(false);

    await renderError();

    expect(container.textContent).toContain("Something went wrong.");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not redirect on non-playbook routes", async () => {
    setPath("/settings");
    vi.mocked(probeConnectivity).mockResolvedValue(false);

    await renderError();

    expect(container.textContent).toContain("Something went wrong.");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not redirect on the plain web", async () => {
    vi.mocked(isNativeApp).mockReturnValue(false);
    setPath("/playbooks/pb-123");
    vi.mocked(getCachedPlaybookMeta).mockResolvedValue({ id: "pb-123" } as never);
    vi.mocked(probeConnectivity).mockResolvedValue(false);

    await renderError();

    expect(container.textContent).toContain("Something went wrong.");
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
