/**
 * Tests for the fb-kg CLI (scripts/fb-kg/cli.ts).
 *
 * The CLI is the human-facing surface on top of the KG — coaches and
 * engineers use it to inspect catalog state without grepping TypeScript
 * files. These tests run the CLI as a subprocess (npx tsx) and assert
 * its output shape — not the full content, just enough to catch
 * regressions in the subcommand interface.
 *
 * Why not snapshot the full output? It's pages of catalog data; full
 * snapshots would dominate diff review every time a route or concept
 * is added. Structural assertions catch what matters (subcommand
 * routing works, JSON mode produces valid JSON, audit reports gaps
 * the same way every time) without locking us into output that has
 * to be regenerated for any cosmetic change.
 */

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../");
const CLI = resolve(REPO_ROOT, "scripts/fb-kg/cli.ts");

function run(args: string): string {
  return execSync(`npx tsx ${CLI} ${args}`, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    maxBuffer: 50 * 1024 * 1024,
  });
}

describe("fb-kg CLI — list", () => {
  it("list (no args) dumps all families", () => {
    const out = run("list");
    expect(out).toContain("Routes (26)");
    expect(out).toContain("Formations (17)");
    expect(out).toContain("Defensive Schemes (19)");
    expect(out).toContain("Concepts (21)");
    expect(out).toContain("Reactor Patterns (30)");
    expect(out).toContain("Total: 113 primitives");
  });

  it("list routes prints only routes", () => {
    const out = run("list routes");
    expect(out).toContain("Routes (26)");
    expect(out).not.toContain("Formations (");
    expect(out).not.toContain("Concepts (");
  });

  it("list concepts prints only concepts (21 entries — includes slant-flat)", () => {
    const out = run("list concepts");
    expect(out).toContain("Concepts (21)");
    expect(out).toContain("slant-flat");
  });

  it("list --json produces valid JSON with all families", () => {
    const out = run("list --json");
    const parsed = JSON.parse(out);
    expect(parsed.routes.length).toBe(26);
    expect(parsed.formations.length).toBe(17);
    expect(parsed.schemes.length).toBe(19);
    expect(parsed.concepts.length).toBe(21);
    expect(parsed.reactorPatterns.length).toBe(30);
  });

  it("list routes --json produces just the routes array", () => {
    const out = run("list routes --json");
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(26);
    expect(parsed[0].family).toBe("route");
  });
});

describe("fb-kg CLI — validate", () => {
  it("validate exits 0 with success message on healthy KG", () => {
    const out = run("validate");
    expect(out).toContain("KG passes all schema + cross-reference + geometry validation");
    expect(out).toContain("26 routes");
  });

  it("validate --json returns ok:true", () => {
    const out = run("validate --json");
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
  });
});

describe("fb-kg CLI — audit", () => {
  it("audit reports no warnings on a healthy KG", () => {
    const out = run("audit");
    expect(out).toContain("KG Audit");
    expect(out).toContain("No warnings");
  });

  it("audit --json returns findings + ok flag", () => {
    const out = run("audit --json");
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.ok).toBe(true);
  });

  it("audit surfaces flag_5v5 schemes gap as an informational note", () => {
    // flag_5v5 only has Cover 1 + Cover 3 — under the threshold of 3 schemes.
    const out = run("audit");
    expect(out).toMatch(/Only 2 schemes entries for variant "flag_5v5"/);
  });
});

describe("fb-kg CLI — help", () => {
  it("help prints usage", () => {
    const out = run("help");
    expect(out).toContain("Football KG CLI");
    expect(out).toContain("list");
    expect(out).toContain("audit");
    expect(out).toContain("validate");
  });
});
