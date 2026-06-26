/**
 * accept_invite — partial-index / ON CONFLICT regression guard.
 *
 * REGRESSION (live until 20260626130000): migration 0082 made the
 * `(playbook_id, user_id)` unique index PARTIAL (`where user_id is not null`)
 * so that unclaimed roster rows (user_id null) can multiply, and rewrote
 * accept_invite to an explicit upsert because of it. Migrations 0192 and
 * 20260618140000 then reintroduced
 *   insert ... on conflict (playbook_id, user_id) do update
 * WITHOUT repeating the index predicate. Postgres cannot infer a partial
 * unique index as an ON CONFLICT arbiter unless the clause repeats the
 * predicate, so the statement raised at runtime:
 *   42P10: there is no unique or exclusion constraint matching the
 *           ON CONFLICT specification
 * on EVERY call. No player could accept any invite — they saw
 * "Could not accept invite: there is no unique or exclusion constraint
 * matching the ON CONFLICT specification". (Coach cancellation, 2026-06-26.)
 *
 * This guard pins the invariant on the LIVE definition of accept_invite (the
 * last migration that `create or replace`s it — last-wins). The same partial
 * index also covers the `playbook_invites` accept path, so the rule is: any
 * `on conflict (playbook_id, user_id)` upsert into playbook_members MUST carry
 * `where user_id is not null`, or not use ON CONFLICT at all (explicit upsert).
 * It would have failed on both 0192 and 20260618140000.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// src/app/actions -> repo root is three levels up.
const MIGRATIONS = join(__dirname, "..", "..", "..", "supabase", "migrations");

function migrationsDefiningAcceptInvite(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) =>
      /create\s+or\s+replace\s+function\s+public\.accept_invite/i.test(
        readFileSync(join(MIGRATIONS, f), "utf8"),
      ),
    )
    .sort(); // filename order == migration apply order
}

/**
 * The body of the accept_invite function from the last migration that
 * defines it. Scoped to accept_invite specifically — the same file may also
 * define remove_and_ban_member, whose `on conflict (playbook_id, user_id)`
 * targets playbook_bans (a TOTAL unique constraint, legitimately predicate-
 * free). accept_invite only ever upserts into playbook_members.
 */
function liveAcceptInviteBody(): { file: string; body: string } {
  const files = migrationsDefiningAcceptInvite();
  expect(files.length).toBeGreaterThan(0);
  const file = files[files.length - 1]!;
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  const lower = sql.toLowerCase();
  const start = lower.indexOf("create or replace function public.accept_invite");
  expect(start).toBeGreaterThanOrEqual(0);
  const slice = sql.slice(start);
  // Body is dollar-quoted: `as $$ ... $$ language plpgsql ...`.
  const open = slice.indexOf("$$");
  const close = slice.indexOf("$$", open + 2);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return { file, body: slice.slice(open + 2, close) };
}

describe("accept_invite — partial unique index / ON CONFLICT arbiter", () => {
  it("the live definition's playbook_members upsert is compatible with the partial index", () => {
    const { file, body } = liveAcceptInviteBody();
    const norm = body.toLowerCase().replace(/\s+/g, " ");

    // accept_invite must upsert into playbook_members.
    expect(norm).toContain("insert into public.playbook_members");

    // Every ON CONFLICT on (playbook_id, user_id) up to its DO action must
    // repeat the partial-index predicate. Lazy match stops at the action so
    // each clause is checked independently. (Zero clauses is also valid —
    // that means an explicit select-then-upsert, which 0082 used.)
    const clauses = [
      ...norm.matchAll(
        /on conflict \(\s*playbook_id\s*,\s*user_id\s*\)(.*?)\b(do\s+(?:update|nothing))/g,
      ),
    ];

    for (const m of clauses) {
      const between = m[1]!;
      expect(
        /where\s+user_id\s+is\s+not\s+null/.test(between),
        `${file}: accept_invite "on conflict (playbook_id, user_id) ... ${m[2]}" ` +
          `must include "where user_id is not null" — the index is partial (0082), ` +
          `so Postgres cannot infer it as an arbiter without the predicate (42P10).`,
      ).toBe(true);
    }
  });

  it("the partial index it depends on still exists (0082)", () => {
    const idxSql = readFileSync(
      join(MIGRATIONS, "0082_roster_claim_flow.sql"),
      "utf8",
    ).toLowerCase();
    expect(idxSql).toMatch(
      /create unique index playbook_members_playbook_user_uniq\s+on public\.playbook_members \(playbook_id, user_id\)\s+where user_id is not null/,
    );
  });
});
