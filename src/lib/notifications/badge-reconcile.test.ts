import { describe, it, expect, vi, beforeEach } from "vitest";

const sendApnsToTokens = vi.fn();
const computeInboxBadgeCount = vi.fn();
const loadApnsConfig = vi.fn();

vi.mock("@/lib/notifications/apns", () => ({
  sendApnsToTokens: (...a: unknown[]) => sendApnsToTokens(...a),
}));
vi.mock("@/lib/inbox/derive", () => ({
  computeInboxBadgeCount: (...a: unknown[]) => computeInboxBadgeCount(...a),
}));
vi.mock("@/lib/site/apns-config", () => ({
  loadApnsConfig: (...a: unknown[]) => loadApnsConfig(...a),
}));

import { reconcileBadgeForUser } from "./badge-reconcile";

const CFG = { keyId: "k", teamId: "t", bundleId: "b", privateKey: "p", primaryHost: "h" };

/** Minimal device_tokens query/update stub. */
function makeAdmin(rows: Array<{ id: string; token: string; last_badge: number | null }>) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        in: (_col: string, ids: string[]) => {
          updates.push({ ...patch, ids });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { admin: admin as never, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadApnsConfig.mockResolvedValue(CFG);
  sendApnsToTokens.mockResolvedValue({ delivered: 1, deadTokenIds: [] });
});

describe("reconcileBadgeForUser", () => {
  it("clears a stuck badge with a badge-only push (no alert, no sound)", async () => {
    // The bug: icon shows 1, inbox is empty.
    computeInboxBadgeCount.mockResolvedValue(0);
    const { admin, updates } = makeAdmin([{ id: "d1", token: "tok", last_badge: 1 }]);

    const res = await reconcileBadgeForUser(admin, "u1");

    expect(res).toMatchObject({ ok: true, status: "reconciled", count: 0 });
    const [, tokens, message] = sendApnsToTokens.mock.calls[0];
    expect(tokens).toEqual([{ id: "d1", token: "tok", badge: 0 }]);
    // Empty title/body is what makes buildApnsPayload omit alert+sound, so the
    // icon updates without showing the coach a banner.
    expect(message).toEqual({ title: "", body: "", badge: 0 });
    expect(updates).toContainEqual({ last_badge: 0, ids: ["d1"] });
  });

  it("does not push when the icon already shows the right count", async () => {
    computeInboxBadgeCount.mockResolvedValue(2);
    const { admin, updates } = makeAdmin([{ id: "d1", token: "tok", last_badge: 2 }]);

    const res = await reconcileBadgeForUser(admin, "u1");

    expect(res).toEqual({ ok: true, status: "already-current", count: 2 });
    expect(sendApnsToTokens).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("is idempotent: a second call after reconciling sends nothing", async () => {
    computeInboxBadgeCount.mockResolvedValue(0);
    const first = makeAdmin([{ id: "d1", token: "tok", last_badge: 1 }]);
    await reconcileBadgeForUser(first.admin, "u1");
    expect(sendApnsToTokens).toHaveBeenCalledTimes(1);

    // Second call sees the last_badge the first one persisted.
    const second = makeAdmin([{ id: "d1", token: "tok", last_badge: 0 }]);
    const res = await reconcileBadgeForUser(second.admin, "u1");

    expect(res).toMatchObject({ status: "already-current" });
    expect(sendApnsToTokens).toHaveBeenCalledTimes(1);
  });

  it("skips a never-badged device with an empty inbox (nothing stuck to clear)", async () => {
    computeInboxBadgeCount.mockResolvedValue(0);
    const { admin } = makeAdmin([{ id: "d1", token: "tok", last_badge: null }]);

    const res = await reconcileBadgeForUser(admin, "u1");

    expect(res).toEqual({ ok: true, status: "already-current", count: 0 });
    expect(sendApnsToTokens).not.toHaveBeenCalled();
  });

  it("badges a never-badged device when there IS something to show", async () => {
    computeInboxBadgeCount.mockResolvedValue(3);
    const { admin } = makeAdmin([{ id: "d1", token: "tok", last_badge: null }]);

    const res = await reconcileBadgeForUser(admin, "u1");

    expect(res).toMatchObject({ status: "reconciled", count: 3 });
  });

  it("only records last_badge for tokens the send actually reached", async () => {
    computeInboxBadgeCount.mockResolvedValue(0);
    sendApnsToTokens.mockResolvedValue({ delivered: 1, deadTokenIds: ["d2"] });
    const { admin, updates } = makeAdmin([
      { id: "d1", token: "a", last_badge: 1 },
      { id: "d2", token: "b", last_badge: 1 },
    ]);

    await reconcileBadgeForUser(admin, "u1");

    // d2 died — remembering a badge we never delivered would strand it.
    expect(updates).toContainEqual({ last_badge: 0, ids: ["d1"] });
    expect(updates.some((u) => u.disabled_reason === "apns_unregistered")).toBe(true);
  });

  it("does not record last_badge when the send transiently failed", async () => {
    // Neither delivered nor dead — a timeout or a 5xx. Recording the badge here
    // would make every later reconcile a no-op and strand the icon forever.
    computeInboxBadgeCount.mockResolvedValue(0);
    sendApnsToTokens.mockResolvedValue({ delivered: 0, deadTokenIds: [] });
    const { admin, updates } = makeAdmin([{ id: "d1", token: "tok", last_badge: 1 }]);

    await reconcileBadgeForUser(admin, "u1");

    expect(updates.some((u) => "last_badge" in u)).toBe(false);
  });

  it("retries after a transient failure instead of giving up", async () => {
    computeInboxBadgeCount.mockResolvedValue(0);
    sendApnsToTokens.mockResolvedValueOnce({ delivered: 0, deadTokenIds: [] });
    const first = makeAdmin([{ id: "d1", token: "tok", last_badge: 1 }]);
    await reconcileBadgeForUser(first.admin, "u1");

    // last_badge is still 1, so the next pass sees a stuck icon and re-sends.
    sendApnsToTokens.mockResolvedValueOnce({ delivered: 1, deadTokenIds: [] });
    const second = makeAdmin([{ id: "d1", token: "tok", last_badge: 1 }]);
    const res = await reconcileBadgeForUser(second.admin, "u1");

    expect(res).toMatchObject({ status: "reconciled", count: 0 });
    expect(second.updates).toContainEqual({ last_badge: 0, ids: ["d1"] });
  });

  it("skips when the count can't be derived rather than guessing", async () => {
    computeInboxBadgeCount.mockResolvedValue(null);
    const { admin } = makeAdmin([{ id: "d1", token: "tok", last_badge: 1 }]);

    const res = await reconcileBadgeForUser(admin, "u1");

    expect(res).toEqual({ ok: true, status: "skipped", reason: "count-underivable" });
    expect(sendApnsToTokens).not.toHaveBeenCalled();
  });

  it("skips when APNs isn't configured", async () => {
    loadApnsConfig.mockResolvedValue(null);
    const { admin } = makeAdmin([{ id: "d1", token: "tok", last_badge: 1 }]);

    const res = await reconcileBadgeForUser(admin, "u1");

    expect(res).toEqual({ ok: true, status: "skipped", reason: "apns-not-configured" });
    expect(sendApnsToTokens).not.toHaveBeenCalled();
  });

  it("skips a user with no iOS devices", async () => {
    const { admin } = makeAdmin([]);

    const res = await reconcileBadgeForUser(admin, "u1");

    expect(res).toEqual({ ok: true, status: "skipped", reason: "no-ios-devices" });
    expect(computeInboxBadgeCount).not.toHaveBeenCalled();
  });

  it("never throws — a send blowing up surfaces as ok:false", async () => {
    computeInboxBadgeCount.mockResolvedValue(0);
    sendApnsToTokens.mockRejectedValue(new Error("apns exploded"));
    const { admin } = makeAdmin([{ id: "d1", token: "tok", last_badge: 1 }]);

    await expect(reconcileBadgeForUser(admin, "u1")).resolves.toEqual({
      ok: false,
      error: "apns exploded",
    });
  });
});
