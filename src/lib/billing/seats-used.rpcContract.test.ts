/**
 * seats_used — live-definition contract (library plan, Phase 3).
 *
 * Pins the LIVE seats_used SQL (last migration that create-or-replaces it,
 * last-wins — same style as invites.acceptInvite.rolePin.test.ts):
 *   1. League ownership path present: playbooks → teams → leagues.created_by,
 *      so league coaches count against the operator's seats.
 *   2. Owner-member path preserved (the pre-league behavior).
 *   3. Only ACTIVE EDITOR memberships count, and Coach+ collaborators still
 *      ride free (free-tier filter) — players never consume seats.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// src/lib/billing -> repo root is three levels up.
const MIGRATIONS = join(__dirname, "..", "..", "..", "supabase", "migrations");

function liveSeatsUsedDefinition(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) =>
      /create\s+or\s+replace\s+function\s+public\.seats_used/i.test(
        readFileSync(join(MIGRATIONS, f), "utf8"),
      ),
    )
    .sort();
  expect(files.length).toBeGreaterThan(0);
  const sql = readFileSync(join(MIGRATIONS, files[files.length - 1]), "utf8");
  return sql.slice(sql.search(/create\s+or\s+replace\s+function\s+public\.seats_used/i));
}

describe("seats_used — live definition", () => {
  const body = liveSeatsUsedDefinition();

  it("counts league team playbooks against the league operator", () => {
    expect(body).toMatch(/join\s+public\.teams\s+t\s+on\s+t\.id\s*=\s*pb\.team_id/i);
    expect(body).toMatch(/join\s+public\.leagues\s+l\s+on\s+l\.id\s*=\s*t\.league_id/i);
    expect(body).toMatch(/l\.created_by\s*=\s*p_owner_id/i);
  });

  it("keeps the owner-member ownership path", () => {
    expect(body).toMatch(/owner_m\.role\s*=\s*'owner'/i);
    expect(body).toMatch(/owner_m\.status\s*=\s*'active'/i);
  });

  it("still counts only active free-tier editors", () => {
    expect(body).toMatch(/m\.role\s*=\s*'editor'/i);
    expect(body).toMatch(/m\.status\s*=\s*'active'/i);
    expect(body).toMatch(/e\.tier\s+is\s+null\s+or\s+e\.tier\s*=\s*'free'/i);
  });
});
