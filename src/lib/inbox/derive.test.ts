import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeInboxBadgeCount, deriveInboxAlerts } from "./derive";

/**
 * A minimal Supabase-query mock. Each `.from(table)` returns a chainable
 * builder whose terminal `await` resolves to preset rows chosen by
 * (table, selectString) — enough to distinguish the three `playbook_members`
 * queries (membership join vs pending-members) that share a table name.
 */
type Rows = Record<string, unknown[]>;

function makeClient(resolve: (table: string, select: string) => unknown[]): SupabaseClient {
  const from = (table: string) => {
    let selectStr = "";
    const builder: Record<string, unknown> = {
      select(s: string) {
        selectStr = s;
        return builder;
      },
      eq() { return builder; },
      is() { return builder; },
      in() { return builder; },
      or() { return builder; },
      lt() { return builder; },
      gt() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle() {
        const rows = resolve(table, selectStr);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(res: (v: { data: unknown; error: null }) => void) {
        res({ data: resolve(table, selectStr), error: null });
      },
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

/** Standard fixture: one owned+member playbook, one pending member, one
 *  roster claim, one copy-share invite → 3 active alerts. */
function fixture(overrides: Partial<Rows> = {}): (table: string, select: string) => unknown[] {
  const base: Rows = {
    "playbook_members:join": [
      {
        playbook_id: "pb1",
        playbooks: { id: "pb1", name: "Team A", logo_url: null, color: null, is_archived: false },
      },
    ],
    "playbook_members:pending": [
      {
        playbook_id: "pb1",
        user_id: "u2",
        role: "viewer",
        status: "pending",
        created_at: "2026-01-01T00:00:00Z",
        coach_upgrade_requested_at: null,
        profiles: { display_name: "Bob" },
      },
    ],
    roster_claims: [
      {
        id: "rc1",
        member_id: "m1",
        user_id: "u3",
        requested_at: "2026-01-02T00:00:00Z",
        note: null,
        member: { playbook_id: "pb1", label: "#7", jersey_number: "7", positions: ["WR"] },
        profiles: { display_name: "Cy" },
      },
    ],
    playbook_events: [],
    playbook_copy_link_sends: [
      {
        id: "cs1",
        sent_at: "2026-01-03T00:00:00Z",
        link: {
          token: "tok",
          expires_at: "2999-01-01T00:00:00Z",
          revoked_at: null,
          playbook: { id: "pb2", name: "Shared", logo_url: null, color: null, is_archived: false },
        },
        sender: { display_name: "Dee" },
      },
    ],
    playbook_event_rsvps: [],
    inbox_state: [],
    system_notices: [],
  };
  const rows = { ...base, ...overrides };
  return (table, select) => {
    if (table === "playbook_members") {
      return (
        (select.includes("coach_upgrade_requested_at")
          ? rows["playbook_members:pending"]
          : rows["playbook_members:join"]) ?? []
      );
    }
    return rows[table] ?? [];
  };
}

describe("computeInboxBadgeCount", () => {
  it("counts every active alert — matches what the inbox bell shows", async () => {
    const client = makeClient(fixture());
    // 1 pending member + 1 roster claim + 1 copy-share = 3
    expect(await computeInboxBadgeCount(client, "owner1")).toBe(3);
  });

  it("subtracts archived items so the badge tracks the visible inbox", async () => {
    const client = makeClient(
      fixture({
        inbox_state: [
          { alert_kind: "membership", source_id: "pb1:u2", status: "archived" },
        ],
      }),
    );
    expect(await computeInboxBadgeCount(client, "owner1")).toBe(2);
  });

  it("subtracts soft-deleted items", async () => {
    const client = makeClient(
      fixture({
        inbox_state: [
          { alert_kind: "roster_claim", source_id: "rc1", status: "deleted" },
          { alert_kind: "share", source_id: "cs1", status: "deleted" },
        ],
      }),
    );
    expect(await computeInboxBadgeCount(client, "owner1")).toBe(1);
  });

  it("excludes site-admin operational notices from the icon badge", async () => {
    // Even if system_notices has rows, the badge path derives with
    // isSiteAdmin:false so they never load — count stays at the 3 coach items.
    const client = makeClient(
      fixture({
        system_notices: [
          {
            id: "n1",
            kind: "user_signup",
            severity: "info",
            user_id: "x",
            user_display_name: "New Coach",
            user_email: "n@x.com",
            body: "signed up",
            href: null,
            detail: null,
            created_at: "2026-01-04T00:00:00Z",
          },
        ],
      }),
    );
    expect(await computeInboxBadgeCount(client, "owner1")).toBe(3);
  });

  it("returns 0 (not null) for a user with an empty inbox", async () => {
    const client = makeClient(
      fixture({
        "playbook_members:pending": [],
        roster_claims: [],
        playbook_copy_link_sends: [],
      } as Partial<Rows>),
    );
    expect(await computeInboxBadgeCount(client, "owner1")).toBe(0);
  });

  it("returns null (badge omitted) when a query errors", async () => {
    const client = {
      from: () => ({
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        in() { return this; },
        or() { return this; },
        lt() { return this; },
        gt() { return this; },
        order() { return this; },
        limit() { return this; },
        then(res: (v: { data: null; error: { message: string } }) => void) {
          res({ data: null, error: { message: "boom" } });
        },
      }),
    } as unknown as SupabaseClient;
    expect(await computeInboxBadgeCount(client, "owner1")).toBeNull();
  });
});

describe("deriveInboxAlerts", () => {
  it("includes admin notices only when isSiteAdmin is true", async () => {
    const rows = fixture({
      system_notices: [
        {
          id: "n1",
          kind: "feedback_received",
          severity: "warn",
          user_id: "x",
          user_display_name: "Coach",
          user_email: "c@x.com",
          body: "left feedback",
          href: null,
          detail: null,
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
    });
    const asAdmin = await deriveInboxAlerts(makeClient(rows), "owner1", { isSiteAdmin: true });
    const asCoach = await deriveInboxAlerts(makeClient(rows), "owner1", { isSiteAdmin: false });
    expect(asAdmin.ok && asAdmin.alerts.some((a) => a.kind === "admin_notice")).toBe(true);
    expect(asCoach.ok && asCoach.alerts.some((a) => a.kind === "admin_notice")).toBe(false);
    // Feedback pins first for the admin.
    expect(asAdmin.ok && asAdmin.alerts[0].kind).toBe("admin_notice");
  });
});
