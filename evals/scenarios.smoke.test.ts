/**
 * Smoke test for the eval suite — runs in CI on every push so the
 * scenario library can't accumulate type/shape rot between full LLM
 * runs (which are slow + cost money + need network access).
 *
 * Verifies, for every `.scenario.ts` file in `evals/scenarios/`:
 *   - It exports a `Scenario` (default OR named `scenario`).
 *   - Required fields are present (name, description, context, chat,
 *     assertions).
 *   - The last chat turn is role:"user" (it's the turn we're testing).
 *   - Every assertion is a callable function.
 *   - Names are unique.
 *
 * No LLM. No network. Pure structural validation.
 */

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Scenario } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, "scenarios");

async function loadScenarios(): Promise<Array<{ file: string; scenario: Scenario }>> {
  const files = readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith(".scenario.ts"));
  const out: Array<{ file: string; scenario: Scenario }> = [];
  for (const f of files) {
    const mod = (await import(join(SCENARIOS_DIR, f))) as { default?: Scenario; scenario?: Scenario };
    const s = mod.default ?? mod.scenario;
    if (s) out.push({ file: f, scenario: s });
  }
  return out;
}

describe("eval scenarios — structural smoke test", () => {
  it("loads at least one scenario", async () => {
    const all = await loadScenarios();
    expect(all.length).toBeGreaterThan(0);
  });

  it("every scenario has the required fields", async () => {
    const all = await loadScenarios();
    for (const { file, scenario: s } of all) {
      expect(s.name, `${file}: name`).toBeTruthy();
      expect(s.description, `${file}: description`).toBeTruthy();
      expect(s.origin, `${file}: origin`).toBeTruthy();
      expect(s.type, `${file}: type`).toMatch(/^(positive|negative)$/);
      expect(s.context, `${file}: context`).toBeTruthy();
      expect(s.context.sportVariant, `${file}: context.sportVariant`).toBeTruthy();
      expect(Array.isArray(s.chat), `${file}: chat is an array`).toBe(true);
      expect(s.chat.length, `${file}: chat has at least one turn`).toBeGreaterThan(0);
      expect(Array.isArray(s.assertions), `${file}: assertions is an array`).toBe(true);
      expect(s.assertions.length, `${file}: assertions has at least one entry`).toBeGreaterThan(0);
    }
  });

  it("the last chat turn is always role:user (that's the turn being tested)", async () => {
    const all = await loadScenarios();
    for (const { file, scenario: s } of all) {
      const last = s.chat[s.chat.length - 1];
      expect(last.role, `${file}: last chat turn must be role:user`).toBe("user");
      expect(last.text, `${file}: last user turn has text`).toBeTruthy();
    }
  });

  it("every assertion is a callable function", async () => {
    const all = await loadScenarios();
    for (const { file, scenario: s } of all) {
      for (let i = 0; i < s.assertions.length; i++) {
        expect(typeof s.assertions[i], `${file}: assertions[${i}] is a function`).toBe("function");
      }
    }
  });

  it("scenario names are unique across the library", async () => {
    const all = await loadScenarios();
    const names = all.map((x) => x.scenario.name);
    const dups = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dups, `duplicate scenario name(s): ${dups.join(", ")}`).toEqual([]);
  });

  it("scenario names match their filename stem (kebab-case)", async () => {
    // Convention: `foo-bar.scenario.ts` exports a Scenario with
    // name="foo-bar". Makes `npx tsx evals/run.ts foo-bar` predictable.
    const all = await loadScenarios();
    for (const { file, scenario: s } of all) {
      const stem = file.replace(/\.scenario\.ts$/, "");
      expect(s.name, `${file} name should match filename stem`).toBe(stem);
    }
  });
});
