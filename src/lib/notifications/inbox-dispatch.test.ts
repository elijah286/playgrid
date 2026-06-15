/**
 * Dispatch-layer goldens. The actual FCM/APNs transport (sendPushToUsers) is
 * mocked — these assert the *routing*: who gets notified, under which category,
 * and that the admin projection claims each notice exactly once.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type PushArg = {
  admin: unknown;
  userIds: string[];
  category: string;
  message: { title: string; body: string; link?: string };
};
// Hoisted so the vi.mock factory (itself hoisted) can reference the same fn.
const { sendPushToUsers } = vi.hoisted(() => ({
  sendPushToUsers: vi.fn((_opts: PushArg) =>
    Promise.resolve({ delivered: 1, configured: true }),
  ),
}));
vi.mock("./push", () => ({ sendPushToUsers }));

import {
  notifyPlaybookOwners,
  notifyUser,
  projectSystemNoticesToAdmins,
} from "./inbox-dispatch";

type TableData = Record<string, unknown[]>;

/**
 * Minimal Supabase builder mock. Every chained filter returns the builder; the
 * builder is thenable so both `await from().select().eq()` and
 * `await from().update().eq().is().select()` resolve. Resolution data is keyed
 * by (table, op). `.is()` calls are recorded so a test can assert the claim
 * filtered on pushed_at IS NULL.
 */
function makeAdmin(data: TableData) {
  const isCalls: Array<{ table: string; col: string; val: unknown }> = [];
  const from = (table: string) => {
    let op: "select" | "update" = "select";
    const builder: Record<string, unknown> = {
      select() {
        return builder;
      },
      update() {
        op = "update";
        return builder;
      },
      eq() {
        return builder;
      },
      is(col: string, val: unknown) {
        isCalls.push({ table, col, val });
        return builder;
      },
      in() {
        return builder;
      },
      gte() {
        return builder;
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        const key = `${table}:${op}`;
        resolve({ data: data[key] ?? data[table] ?? [], error: null });
      },
    };
    return builder;
  };
  return { from, __isCalls: isCalls } as unknown as Parameters<
    typeof projectSystemNoticesToAdmins
  >[0]["admin"] & { __isCalls: typeof isCalls };
}

afterEach(() => {
  sendPushToUsers.mockClear();
});

describe("notifyPlaybookOwners", () => {
  it("pushes active owners and excludes the requester", async () => {
    const admin = makeAdmin({
      playbook_members: [{ user_id: "owner1" }, { user_id: "requester" }],
    });
    await notifyPlaybookOwners({
      admin,
      playbookId: "pb1",
      excludeUserId: "requester",
      category: "roster_access",
      message: { title: "Join request", body: "X wants in" },
    });
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    const arg = sendPushToUsers.mock.calls[0][0] as {
      userIds: string[];
      category: string;
    };
    expect(arg.userIds).toEqual(["owner1"]);
    expect(arg.category).toBe("roster_access");
  });

  it("no-ops when the only owner is the requester", async () => {
    const admin = makeAdmin({ playbook_members: [{ user_id: "me" }] });
    await notifyPlaybookOwners({
      admin,
      playbookId: "pb1",
      excludeUserId: "me",
      category: "roster_access",
      message: { title: "t", body: "b" },
    });
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});

describe("notifyUser", () => {
  it("pushes the single recipient under the given category", async () => {
    const admin = makeAdmin({});
    await notifyUser({
      admin,
      userId: "u9",
      category: "shares_mentions",
      message: { title: "Shared", body: "A playbook was shared" },
    });
    const arg = sendPushToUsers.mock.calls[0][0] as { userIds: string[]; category: string };
    expect(arg.userIds).toEqual(["u9"]);
    expect(arg.category).toBe("shares_mentions");
  });

  it("no-ops on an empty recipient", async () => {
    const admin = makeAdmin({});
    await notifyUser({ admin, userId: "", category: "shares_mentions", message: { title: "t", body: "b" } });
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});

describe("projectSystemNoticesToAdmins", () => {
  it("claims fresh notices (pushed_at IS NULL) and fans out to every admin", async () => {
    const admin = makeAdmin({
      "system_notices:update": [
        {
          id: "n1",
          kind: "subscription_purchased",
          body: "purchased Team Coach",
          user_display_name: "Jakob",
          user_email: "j@x.com",
          href: "/admin/users",
        },
      ],
      "profiles:select": [{ id: "admin1" }, { id: "admin2" }],
    });

    const res = await projectSystemNoticesToAdmins({ admin, userId: "buyer" });

    expect(res.pushed).toBe(1);
    // Claim must filter on the unclaimed marker.
    expect(admin.__isCalls).toContainEqual({ table: "system_notices", col: "pushed_at", val: null });
    const arg = sendPushToUsers.mock.calls[0][0] as {
      userIds: string[];
      category: string;
      message: { title: string; body: string };
    };
    expect(arg.category).toBe("admin_ops");
    expect(arg.userIds).toEqual(["admin1", "admin2"]);
    expect(arg.message.body).toBe("Jakob purchased Team Coach");
  });

  it("does not double the name on signup notices", async () => {
    const admin = makeAdmin({
      "system_notices:update": [
        { id: "n2", kind: "user_signup", body: "Jakob signed up", user_display_name: "Jakob", user_email: null, href: "/admin/users" },
      ],
      "profiles:select": [{ id: "admin1" }],
    });
    await projectSystemNoticesToAdmins({ admin, userId: "newuser" });
    const arg = sendPushToUsers.mock.calls[0][0] as { message: { body: string } };
    expect(arg.message.body).toBe("Jakob signed up");
  });

  it("no-ops (no push) when nothing was claimed", async () => {
    const admin = makeAdmin({ "system_notices:update": [], "profiles:select": [{ id: "admin1" }] });
    const res = await projectSystemNoticesToAdmins({ admin, userId: "u" });
    expect(res.pushed).toBe(0);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});
