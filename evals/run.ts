/**
 * Eval suite CLI.
 *
 * Usage:
 *   npx tsx evals/run.ts                # run every scenario
 *   npx tsx evals/run.ts diamond        # run scenarios whose name
 *                                       # contains "diamond"
 *   npx tsx evals/run.ts --json         # machine-readable output
 *
 * Loads every `.scenario.ts` file under `evals/scenarios/`, runs them
 * in series (rate-limit friendly), prints a summary, exits with code
 * 1 if any scenario failed.
 *
 * Real Claude API. Set ANTHROPIC_API_KEY in .env.local before running.
 */

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runScenario } from "./runner";
import type { Scenario } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadAllScenarios(): Promise<Scenario[]> {
  const dir = join(__dirname, "scenarios");
  const files = readdirSync(dir).filter((f) => f.endsWith(".scenario.ts"));
  const scenarios: Scenario[] = [];
  for (const f of files) {
    const mod = (await import(join(dir, f))) as { default?: Scenario; scenario?: Scenario };
    const s = mod.default ?? mod.scenario;
    if (s) scenarios.push(s);
  }
  return scenarios;
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const filter = args.find((a) => !a.startsWith("--"));

  const all = await loadAllScenarios();
  const scenarios = filter ? all.filter((s) => s.name.includes(filter)) : all;

  if (scenarios.length === 0) {
    console.error(filter ? `No scenarios match "${filter}".` : "No scenarios found in evals/scenarios/.");
    process.exit(1);
  }

  if (!asJson) {
    console.log(`Running ${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"}...\n`);
  }

  const results = [];
  for (const s of scenarios) {
    if (!asJson) {
      process.stdout.write(`  ${s.name.padEnd(50)} `);
    }
    const r = await runScenario(s);
    results.push(r);
    if (!asJson) {
      console.log(r.ok ? `✓ (${r.capture.durationMs}ms)` : `✗ (${r.capture.durationMs}ms)`);
    }
  }

  if (asJson) {
    // Slim JSON output: just what fits in CI logs / piped tools.
    console.log(
      JSON.stringify(
        results.map((r) => ({
          name: r.scenario.name,
          ok: r.ok,
          error: r.error ?? null,
          durationMs: r.capture.durationMs,
          failedAssertions: r.assertions
            .filter((a) => !a.ok)
            .map((a) => ({ description: a.description, details: a.ok ? "" : a.details })),
        })),
        null,
        2,
      ),
    );
  } else {
    // Human summary.
    console.log("");
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      console.log(`All ${results.length} scenarios passed.`);
    } else {
      console.log(`${failed.length} of ${results.length} scenarios failed:`);
      for (const r of failed) {
        console.log(`\n── ${r.scenario.name} ──`);
        console.log(`  ${r.scenario.description}`);
        if (r.error) {
          console.log(`  ERROR: ${r.error}`);
        } else {
          for (const a of r.assertions.filter((x) => !x.ok)) {
            if (!a.ok) {
              console.log(`  ✗ ${a.description}`);
              console.log(`    ${a.details}`);
            }
          }
        }
        // Brief tool-call trace for context.
        const trace = r.capture.toolCalls.map((c) => c.name).join(" → ") || "(no tools)";
        console.log(`  trace: ${trace}`);
      }
    }
  }

  const exitCode = results.every((r) => r.ok) ? 0 : 1;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error("Eval runner crashed:", e);
  process.exit(2);
});
