/**
 * Regression tests for concurrent-session tracking.
 *
 * The load-bearing invariant: "latest sign-in wins." When a user signs in on
 * a device whose row was previously cap-kicked, that device must RECLAIM its
 * slot — the older least-recently-used peer gets evicted, never the device the
 * user just signed in on. Before this fix touchUserSession returned `revoked`
 * unconditionally on any revoked row, so re-signing-in on a kicked device
 * immediately bounced the user to /login?reason=signed_out_elsewhere — the
 * exact "I just logged in and got kicked" bug.
 *
 * The discriminator is the Supabase `session_id`: same id => the kicked
 * session is still navigating (stay revoked); different id => a fresh sign-in
 * (reclaim).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- In-memory fake of the service-role client -----------------------------
//
// Models a single `user_sessions` table as an array of rows and supports the
// exact query chains touchUserSession + enforceSessionCap build:
//   select(...).eq(...).eq(...).maybeSingle()                 (row lookup)
//   select(...).eq(...).eq(...).is(...).order(...)            (cap scan, awaited)
//   update(patch).eq("id", id) | .in("id", ids)
//   insert(row)

type Row = Record<string, unknown>;

let table: Row[] = [];
let idCounter = 1;

function makeQuery() {
  const filters: Array<(r: Row) => boolean> = [];
  let orderKey: string | null = null;
  let orderAsc = true;

  const select = () => {
    const result = () =>
      table
        .filter((r) => filters.every((f) => f(r)))
        .slice()
        .sort((a, b) => {
          if (!orderKey) return 0;
          const av = (a[orderKey] ?? "") as string;
          const bv = (b[orderKey] ?? "") as string;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
    const api: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      is(col: string, val: unknown) {
        filters.push((r) => (r[col] ?? null) === val);
        return api;
      },
      order(col: string, opts: { ascending: boolean }) {
        orderKey = col;
        orderAsc = opts.ascending;
        return api;
      },
      maybeSingle() {
        return Promise.resolve({ data: result()[0] ?? null, error: null });
      },
      // enforceSessionCap awaits the builder directly after .order().
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve({ data: result(), error: null }).then(
          resolve,
          reject,
        );
      },
    };
    return api;
  };

  return {
    select,
    update(patch: Row) {
      const apply = (match: (r: Row) => boolean) => {
        table.forEach((r) => {
          if (match(r)) Object.assign(r, patch);
        });
        return Promise.resolve({ error: null });
      };
      return {
        eq: (col: string, val: unknown) => apply((r) => r[col] === val),
        in: (col: string, vals: unknown[]) =>
          apply((r) => vals.includes(r[col])),
      };
    },
    insert(row: Row) {
      table.push({
        id: `id-${idCounter++}`,
        revoked_at: null,
        revoked_reason: null,
        last_seen_at: new Date().toISOString(),
        ...row,
      });
      return Promise.resolve({ error: null });
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleClient: () => ({ from: () => makeQuery() }),
}));

import { touchUserSession } from "@/lib/auth/sessions";

const USER = "user-1";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile";

function seed(row: Row) {
  table.push({
    id: `id-${idCounter++}`,
    user_id: USER,
    revoked_at: null,
    revoked_reason: null,
    device_class: "mobile",
    last_seen_at: new Date().toISOString(),
    ...row,
  });
}

function rowFor(deviceId: string): Row | undefined {
  return table.find((r) => r.device_id === deviceId);
}

beforeEach(() => {
  table = [];
  idCounter = 1;
});

describe("touchUserSession — latest-sign-in-wins reclaim", () => {
  it("reclaims a cap-kicked device on a fresh sign-in (new session_id)", async () => {
    seed({
      device_id: "deviceD",
      revoked_at: new Date("2026-06-01").toISOString(),
      revoked_reason: "cap_kicked",
      auth_session_id: "S_old",
    });

    const result = await touchUserSession({
      userId: USER,
      deviceId: "deviceD",
      ip: null,
      userAgent: MOBILE_UA,
      authSessionId: "S_new",
    });

    expect(result).toEqual({ kind: "ok" });
    const row = rowFor("deviceD")!;
    expect(row.revoked_at).toBeNull();
    expect(row.revoked_reason).toBeNull();
    expect(row.auth_session_id).toBe("S_new");
  });

  it("keeps the device signed out when the SAME kicked session navigates", async () => {
    seed({
      device_id: "deviceD",
      revoked_at: new Date("2026-06-01").toISOString(),
      revoked_reason: "cap_kicked",
      auth_session_id: "S_same",
    });

    const result = await touchUserSession({
      userId: USER,
      deviceId: "deviceD",
      ip: null,
      userAgent: MOBILE_UA,
      authSessionId: "S_same",
    });

    expect(result).toEqual({ kind: "revoked", reason: "cap_kicked" });
    expect(rowFor("deviceD")!.revoked_at).not.toBeNull();
  });

  it("reclaim evicts the LRU peer, not the device that just signed in", async () => {
    // Two active mobile peers (cap is 2) + the returning kicked device.
    seed({
      device_id: "peerOld",
      auth_session_id: "S_peer_old",
      last_seen_at: new Date("2026-06-01T00:00:00Z").toISOString(),
    });
    seed({
      device_id: "peerNew",
      auth_session_id: "S_peer_new",
      last_seen_at: new Date("2026-06-10T00:00:00Z").toISOString(),
    });
    seed({
      device_id: "deviceD",
      revoked_at: new Date("2026-06-05").toISOString(),
      revoked_reason: "cap_kicked",
      auth_session_id: "S_old",
      last_seen_at: new Date("2026-06-05T00:00:00Z").toISOString(),
    });

    const result = await touchUserSession({
      userId: USER,
      deviceId: "deviceD",
      ip: null,
      userAgent: MOBILE_UA,
      authSessionId: "S_new",
    });

    expect(result).toEqual({ kind: "ok" });
    // The device that just signed in stays active...
    expect(rowFor("deviceD")!.revoked_at).toBeNull();
    // ...exactly the cap (2) mobile rows remain active...
    const active = table.filter(
      (r) => r.device_class === "mobile" && r.revoked_at == null,
    );
    expect(active.length).toBe(2);
    // ...and the evicted one is the least-recently-used peer.
    expect(rowFor("peerOld")!.revoked_at).not.toBeNull();
    expect(rowFor("peerOld")!.revoked_reason).toBe("cap_kicked");
    expect(rowFor("peerNew")!.revoked_at).toBeNull();
  });

  it("reclaims a legacy revoked row whose session_id was never recorded", async () => {
    seed({
      device_id: "deviceD",
      revoked_at: new Date("2026-06-01").toISOString(),
      revoked_reason: "cap_kicked",
      auth_session_id: null, // legacy row, pre-migration
    });

    const result = await touchUserSession({
      userId: USER,
      deviceId: "deviceD",
      ip: null,
      userAgent: MOBILE_UA,
      authSessionId: "S_new",
    });

    expect(result).toEqual({ kind: "ok" });
    expect(rowFor("deviceD")!.revoked_at).toBeNull();
  });
});

describe("touchUserSession — first sight + active touch", () => {
  it("inserts a row with the session id on first sight of a device", async () => {
    const result = await touchUserSession({
      userId: USER,
      deviceId: "brandNew",
      ip: null,
      userAgent: MOBILE_UA,
      authSessionId: "S_fresh",
    });

    expect(result).toEqual({ kind: "ok" });
    const row = rowFor("brandNew")!;
    expect(row.revoked_at).toBeNull();
    expect(row.auth_session_id).toBe("S_fresh");
    expect(row.device_class).toBe("mobile");
  });

  it("keeps the stored session id current on an active touch", async () => {
    seed({ device_id: "deviceD", auth_session_id: "S_one" });

    await touchUserSession({
      userId: USER,
      deviceId: "deviceD",
      ip: null,
      userAgent: MOBILE_UA,
      authSessionId: "S_two",
    });

    expect(rowFor("deviceD")!.auth_session_id).toBe("S_two");
  });

  it("does not clobber a stored session id with null on a decode miss", async () => {
    seed({ device_id: "deviceD", auth_session_id: "S_one" });

    await touchUserSession({
      userId: USER,
      deviceId: "deviceD",
      ip: null,
      userAgent: MOBILE_UA,
      authSessionId: null,
    });

    expect(rowFor("deviceD")!.auth_session_id).toBe("S_one");
  });
});
