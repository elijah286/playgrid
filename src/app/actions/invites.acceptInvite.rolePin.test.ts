/**
 * accept_invite — role + roster contract pin (library plan, Phase 0).
 *
 * The league library & distribution model (docs/league-platform/
 * LIBRARY-DISTRIBUTION-PLAN.md) hands a team playbook to its coach via a
 * playbook INVITE: the coach becomes a member with the invite's role and
 * lands on the roster — while the org keeps ownership (that's what makes
 * "operator's seat" real, keeps the coach's own free-playbook quota
 * untouched, and lets a replacement coach be invited to the same playbook).
 *
 * This pins the invariants on the LIVE definition of accept_invite (the
 * last migration that `create or replace`s it — last-wins), in the same
 * style as invites.acceptInvite.partialIndex.test.ts:
 *   1. The membership role comes from the INVITE row — never a hardcoded
 *      role literal in the insert values.
 *   2. On re-accept/conflict the role can only keep-or-upgrade via the
 *      rank comparison — accepting can never DEMOTE an existing member.
 *   3. Ownership is never granted by acceptance: no 'owner' literal is
 *      assigned to the membership role anywhere in the accept path.
 *   4. The roster behavior is present: membership status honors the
 *      playbook's roster_approval_required setting (join-puts-you-on-roster
 *      with optional tentative status).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// src/app/actions -> repo root is three levels up.
const MIGRATIONS = join(__dirname, "..", "..", "..", "supabase", "migrations");

function liveAcceptInviteDefinition(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) =>
      /create\s+or\s+replace\s+function\s+public\.accept_invite/i.test(
        readFileSync(join(MIGRATIONS, f), "utf8"),
      ),
    )
    .sort();
  expect(files.length).toBeGreaterThan(0);
  const file = files[files.length - 1];
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  // Isolate the function body (from the create statement to its closing $$).
  const start = sql.search(/create\s+or\s+replace\s+function\s+public\.accept_invite/i);
  const body = sql.slice(start);
  return { file, body };
}

describe("accept_invite — live definition contract", () => {
  const { body } = liveAcceptInviteDefinition();

  it("inserts the membership with the invite's role, not a literal", () => {
    const insert = body.match(
      /insert\s+into\s+public\.playbook_members\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/i,
    );
    expect(insert).not.toBeNull();
    const [, columns, values] = insert!;
    expect(columns).toMatch(/\brole\b/);
    // The role position in VALUES must reference the invite record (inv.role),
    // not a quoted literal.
    const cols = columns.split(",").map((c) => c.trim());
    const vals = values.split(",").map((v) => v.trim());
    const roleIdx = cols.findIndex((c) => c === "role");
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(vals[roleIdx]).toMatch(/^inv\.role$/i);
  });

  it("conflict path can keep-or-upgrade the role but never demote", () => {
    // The upsert resolves role via the rank comparison helper — its presence
    // (comparing existing vs excluded) is the no-demotion guarantee.
    expect(body).toMatch(/_playbook_role_rank\s*\(\s*public\.playbook_members\.role\s*\)/i);
    expect(body).toMatch(/_playbook_role_rank\s*\(\s*excluded\.role\s*\)/i);
  });

  it("never assigns 'owner' as a membership role in the accept path", () => {
    // Ownership must come from playbook creation, never from accepting an
    // invite. Assert no role assignment to the 'owner' literal exists.
    expect(body).not.toMatch(/role\s*(=|,)\s*'owner'/i);
    expect(body).not.toMatch(/values\s*\([^)]*'owner'/i);
  });

  it("honors roster approval (join-puts-you-on-roster, optionally tentative)", () => {
    expect(body).toMatch(/roster_approval_required/i);
  });
});
