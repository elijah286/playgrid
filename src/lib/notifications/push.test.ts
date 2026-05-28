/**
 * Goldens for sendPushToUsers — the FCM HTTP v1 fan-out.
 *
 * We never hit Google: the OAuth token mint and the messages:send call are
 * both routed through a mocked global fetch. A real RSA keypair is generated
 * per-suite so the RS256 JWT signing path actually executes (a fake PEM would
 * throw in crypto.createSign).
 */
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendPushToUsers, __resetPushTokenCacheForTests } from "./push";

type TableData = {
  push_opt_outs?: Array<{ user_id: string }>;
  device_tokens?: Array<{ id: string; token: string }>;
};

function makeAdmin(data: TableData) {
  const updates: Array<{ table: string; payload: Record<string, unknown>; ids: string[] }> = [];
  const from = (table: string) => {
    let op: "select" | "update" = "select";
    let payload: Record<string, unknown> = {};
    let inIds: string[] = [];
    const builder: Record<string, unknown> = {
      select() { return builder; },
      eq() { return builder; },
      is() { return builder; },
      in(_col: string, ids: string[]) { inIds = ids; return builder; },
      update(p: Record<string, unknown>) { op = "update"; payload = p; return builder; },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (op === "update") {
          updates.push({ table, payload, ids: inIds });
          resolve({ data: null, error: null });
          return;
        }
        resolve({ data: (data as Record<string, unknown[]>)[table] ?? [], error: null });
      },
    };
    return builder;
  };
  return { from, __updates: updates } as unknown as Parameters<typeof sendPushToUsers>[0]["admin"] & {
    __updates: typeof updates;
  };
}

let privateKey: string;

beforeEach(() => {
  __resetPushTokenCacheForTests();
  ({ privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }));
});

afterEach(() => {
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setServiceAccount() {
  process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "fcm@example.iam.gserviceaccount.com",
    private_key: privateKey,
    project_id: "test-project",
  });
}

describe("sendPushToUsers", () => {
  it("no-ops when no service account is configured", async () => {
    const admin = makeAdmin({ device_tokens: [{ id: "t1", token: "tok1" }] });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await sendPushToUsers({
      admin,
      userIds: ["u1"],
      category: "team",
      message: { title: "hi", body: "there" },
    });

    expect(res).toEqual({ delivered: 0, configured: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("delivers to active tokens and excludes opted-out users", async () => {
    setServiceAccount();
    const admin = makeAdmin({
      push_opt_outs: [{ user_id: "u2" }],
      device_tokens: [{ id: "t1", token: "tok1" }],
    });
    const fetchSpy = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "ya29", expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ name: "ok" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const res = await sendPushToUsers({
      admin,
      userIds: ["u1", "u2"],
      category: "calendar",
      message: { title: "Reminder", body: "Practice 5pm", link: "/playbooks/x?tab=calendar" },
    });

    expect(res).toEqual({ delivered: 1, configured: true });
    // One oauth call + one send call.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const sendCall = fetchSpy.mock.calls.find(([u]) => String(u).includes("fcm.googleapis.com"));
    const sentBody = JSON.parse((sendCall?.[1] as RequestInit).body as string);
    expect(sentBody.message.token).toBe("tok1");
    expect(sentBody.message.notification.title).toBe("Reminder");
    expect(sentBody.message.data.link).toBe("/playbooks/x?tab=calendar");
  });

  it("soft-disables tokens FCM reports as unregistered", async () => {
    setServiceAccount();
    const admin = makeAdmin({
      device_tokens: [
        { id: "t1", token: "good" },
        { id: "t2", token: "dead" },
      ],
    });
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "ya29", expires_in: 3600 }), { status: 200 });
      }
      const body = JSON.parse((init?.body as string) ?? "{}");
      if (body.message.token === "dead") {
        return new Response(
          JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }),
          { status: 404 },
        );
      }
      return new Response(JSON.stringify({ name: "ok" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const res = await sendPushToUsers({
      admin,
      userIds: ["u1"],
      category: "team",
      message: { title: "t", body: "b" },
    });

    expect(res.delivered).toBe(1);
    expect(admin.__updates).toHaveLength(1);
    expect(admin.__updates[0].table).toBe("device_tokens");
    expect(admin.__updates[0].ids).toEqual(["t2"]);
    expect(admin.__updates[0].payload.disabled_reason).toBe("fcm_unregistered");
  });

  it("does not send when all recipients are opted out", async () => {
    setServiceAccount();
    const admin = makeAdmin({
      push_opt_outs: [{ user_id: "u1" }],
      device_tokens: [{ id: "t1", token: "tok1" }],
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const res = await sendPushToUsers({
      admin,
      userIds: ["u1"],
      category: "team",
      message: { title: "t", body: "b" },
    });

    // filterOptedOut removes u1 → no token lookup hits → no fetch.
    expect(res).toEqual({ delivered: 0, configured: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
