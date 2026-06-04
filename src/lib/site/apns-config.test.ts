import { describe, expect, it } from "vitest";
import { loadApnsConfig, previewApnsKey } from "./apns-config";
import { PROD_HOST, SANDBOX_HOST } from "@/lib/notifications/apns";

// Minimal admin stub: only the site_settings single-row read path is used.
function adminReturning(row: Record<string, unknown> | null) {
  return {
    from() {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: row, error: null });
        },
      };
      return builder;
    },
  } as unknown as Parameters<typeof loadApnsConfig>[0];
}

const FULL = {
  apns_key_p8: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
  apns_key_id: "YQ8U72PDK4",
  apns_team_id: "X8KHNQJC32",
  apns_bundle_id: "com.xogridmaker.app",
  apns_use_sandbox: false,
};

describe("loadApnsConfig", () => {
  it("returns a full config when all columns are present", async () => {
    const cfg = await loadApnsConfig(adminReturning(FULL));
    expect(cfg).toEqual({
      keyId: "YQ8U72PDK4",
      teamId: "X8KHNQJC32",
      bundleId: "com.xogridmaker.app",
      privateKey: FULL.apns_key_p8,
      primaryHost: PROD_HOST,
    });
  });

  it("uses the sandbox host when apns_use_sandbox is true", async () => {
    const cfg = await loadApnsConfig(adminReturning({ ...FULL, apns_use_sandbox: true }));
    expect(cfg?.primaryHost).toBe(SANDBOX_HOST);
  });

  it("normalizes escaped newlines in the key", async () => {
    const cfg = await loadApnsConfig(
      adminReturning({ ...FULL, apns_key_p8: "line1\\nline2" }),
    );
    expect(cfg?.privateKey).toBe("line1\nline2");
  });

  it("returns null when a required column is missing/blank", async () => {
    expect(await loadApnsConfig(adminReturning({ ...FULL, apns_key_id: "" }))).toBeNull();
    expect(await loadApnsConfig(adminReturning({ ...FULL, apns_key_p8: null }))).toBeNull();
    expect(await loadApnsConfig(adminReturning(null))).toBeNull();
  });
});

describe("previewApnsKey", () => {
  it("reports configured vs not", () => {
    expect(previewApnsKey(null).configured).toBe(false);
    expect(previewApnsKey("anything").configured).toBe(true);
  });
});
