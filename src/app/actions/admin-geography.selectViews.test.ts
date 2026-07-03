/**
 * selectGeoViews — the view-selection filter behind the Geography tab.
 *
 * Two independent gates: admin-session exclusion (always on) and the
 * paying-users-only toggle. These tests pin both, and the interaction between
 * them (an admin who also pays is still excluded; anonymous traffic vanishes in
 * paying-only mode).
 */
import { describe, expect, it } from "vitest";
import { selectGeoViews } from "./admin-geography";

type V = { session_id: string; user_id: string | null };

const rows: V[] = [
  { session_id: "s-anon", user_id: null }, // signed-out visitor
  { session_id: "s-free", user_id: "u-free" }, // signed-in, not paying
  { session_id: "s-pay", user_id: "u-pay" }, // paying customer
  { session_id: "s-admin", user_id: "u-admin" }, // admin
];

describe("selectGeoViews", () => {
  it("drops admin sessions but keeps everything else when not paying-only", () => {
    const out = selectGeoViews(rows, {
      adminIds: new Set(["u-admin"]),
      payingUserIds: null,
    });
    expect(out.map((r) => r.session_id)).toEqual(["s-anon", "s-free", "s-pay"]);
  });

  it("keeps only paying users' views in paying-only mode", () => {
    const out = selectGeoViews(rows, {
      adminIds: new Set(["u-admin"]),
      payingUserIds: new Set(["u-pay"]),
    });
    expect(out.map((r) => r.session_id)).toEqual(["s-pay"]);
  });

  it("drops anonymous (signed-out) views in paying-only mode", () => {
    const out = selectGeoViews([{ session_id: "s-anon", user_id: null }], {
      adminIds: new Set<string>(),
      payingUserIds: new Set(["u-pay"]),
    });
    expect(out).toEqual([]);
  });

  it("excludes a whole session that was ever admin-authenticated, even its anonymous hits", () => {
    // Two rows share a session id; one carries the admin user_id. Both drop.
    const shared: V[] = [
      { session_id: "s1", user_id: "u-admin" },
      { session_id: "s1", user_id: null },
      { session_id: "s2", user_id: "u-pay" },
    ];
    const out = selectGeoViews(shared, {
      adminIds: new Set(["u-admin"]),
      payingUserIds: null,
    });
    expect(out.map((r) => r.session_id)).toEqual(["s2"]);
  });

  it("excludes an admin even if they are also in the paying set", () => {
    const out = selectGeoViews(rows, {
      adminIds: new Set(["u-admin"]),
      payingUserIds: new Set(["u-pay", "u-admin"]),
    });
    expect(out.map((r) => r.session_id)).toEqual(["s-pay"]);
  });
});
