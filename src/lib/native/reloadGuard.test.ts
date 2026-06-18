import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetReloadGuardsForTest,
  isReloadBlocked,
  registerReloadGuard,
  triggerAppReload,
  triggerAppReloadIfNewBuild,
} from "./reloadGuard";
import { isNewDeployAvailable } from "./deployVersion";

vi.mock("./deployVersion", () => ({
  isNewDeployAvailable: vi.fn(),
}));

afterEach(() => {
  __resetReloadGuardsForTest();
  document.documentElement.className = "";
  vi.mocked(isNewDeployAvailable).mockReset();
});

async function withMockedReload(
  run: (reload: ReturnType<typeof vi.fn>) => void | Promise<void>,
) {
  const reload = vi.fn();
  const original = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, reload },
  });
  try {
    await run(reload);
  } finally {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  }
}

describe("isReloadBlocked", () => {
  it("is false with no guards registered", () => {
    expect(isReloadBlocked()).toBe(false);
  });

  it("is true while a registered guard returns true", () => {
    const unregister = registerReloadGuard(() => true);
    expect(isReloadBlocked()).toBe(true);
    unregister();
    expect(isReloadBlocked()).toBe(false);
  });

  it("reflects the guard's live value", () => {
    let editing = false;
    registerReloadGuard(() => editing);
    expect(isReloadBlocked()).toBe(false);
    editing = true;
    expect(isReloadBlocked()).toBe(true);
  });

  it("is blocked when any one of several guards blocks", () => {
    registerReloadGuard(() => false);
    registerReloadGuard(() => true);
    expect(isReloadBlocked()).toBe(true);
  });

  it("ignores a throwing guard and lets the others decide", () => {
    registerReloadGuard(() => {
      throw new Error("boom");
    });
    expect(isReloadBlocked()).toBe(false);
    registerReloadGuard(() => true);
    expect(isReloadBlocked()).toBe(true);
  });

  it("is blocked when the fullscreen Cal thread lock is up", () => {
    document.documentElement.classList.add("messages-mobile-lock");
    expect(isReloadBlocked()).toBe(true);
  });
});

describe("triggerAppReload", () => {
  it("reloads when nothing blocks", () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
    try {
      triggerAppReload();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });

  it("does not reload while a guard blocks", () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
    registerReloadGuard(() => true);
    try {
      triggerAppReload();
      expect(reload).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });
});

describe("triggerAppReloadIfNewBuild", () => {
  it("reloads when a new deploy is live and nothing blocks", async () => {
    vi.mocked(isNewDeployAvailable).mockResolvedValue(true);
    await withMockedReload(async (reload) => {
      await triggerAppReloadIfNewBuild();
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it("does not reload when the live deploy is unchanged", async () => {
    vi.mocked(isNewDeployAvailable).mockResolvedValue(false);
    await withMockedReload(async (reload) => {
      await triggerAppReloadIfNewBuild();
      expect(reload).not.toHaveBeenCalled();
    });
  });

  it("does not probe the version when a guard already blocks", async () => {
    registerReloadGuard(() => true);
    await withMockedReload(async (reload) => {
      await triggerAppReloadIfNewBuild();
      expect(isNewDeployAvailable).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });
  });

  it("does not reload if a guard goes up during the version probe", async () => {
    let unregister: (() => void) | undefined;
    vi.mocked(isNewDeployAvailable).mockImplementation(async () => {
      // A coach starts an edit while the request is in flight.
      unregister = registerReloadGuard(() => true);
      return true;
    });
    await withMockedReload(async (reload) => {
      await triggerAppReloadIfNewBuild();
      expect(reload).not.toHaveBeenCalled();
    });
    unregister?.();
  });
});
