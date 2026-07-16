import { describe, it, expect, vi, beforeEach } from "vitest";

const checkPermissions = vi.fn();
const requestPermissions = vi.fn();
const register = vi.fn(async () => {});
const addListener = vi.fn(async () => ({ remove: vi.fn() }));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: () => checkPermissions(),
    requestPermissions: () => requestPermissions(),
    register: () => register(),
    addListener: () => addListener(),
    removeAllListeners: vi.fn(async () => {}),
  },
}));

const isNative = vi.fn(() => true);
vi.mock("@/lib/native/isNativeApp", () => ({
  isNativeApp: () => isNative(),
  nativePlatform: () => "ios",
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: { set: vi.fn(async () => {}) },
}));
vi.mock("@capacitor/app", () => ({
  App: { getInfo: vi.fn(async () => ({ version: "1.0.2" })) },
}));

import { registerPush } from "./registerPush";

beforeEach(() => {
  vi.clearAllMocks();
  isNative.mockReturnValue(true);
});

describe("registerPush", () => {
  /**
   * The regression that cost us the one-shot. registerPush runs on every
   * authenticated app start; if it prompts, iOS spends its single permission
   * alert at a cold login with no context and a reflexive "Don't Allow" kills
   * reminders for that install permanently. Asking is PushPrimingDialog's job.
   */
  it("NEVER prompts when permission has not been decided", async () => {
    checkPermissions.mockResolvedValue({ receive: "prompt" });
    await registerPush();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("never prompts on prompt-with-rationale either", async () => {
    checkPermissions.mockResolvedValue({ receive: "prompt-with-rationale" });
    await registerPush();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("does not re-prompt a coach who already declined", async () => {
    checkPermissions.mockResolvedValue({ receive: "denied" });
    await registerPush();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("registers silently when permission is already granted", async () => {
    checkPermissions.mockResolvedValue({ receive: "granted" });
    const teardown = await registerPush();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalledOnce();
    expect(typeof teardown).toBe("function");
  });

  it("no-ops on web", async () => {
    isNative.mockReturnValue(false);
    await registerPush();
    expect(checkPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});
