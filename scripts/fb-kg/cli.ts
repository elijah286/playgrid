/**
 * Football KG CLI — list, audit, validate, generate.
 *
 * Usage:
 *   npx tsx scripts/fb-kg/cli.ts list [<family>]   # dump catalog (all or one family)
 *   npx tsx scripts/fb-kg/cli.ts audit              # gaps + completeness report
 *   npx tsx scripts/fb-kg/cli.ts validate           # run KG cross-ref + schema validators
 *   npx tsx scripts/fb-kg/cli.ts seed               # alias for generate-kb-seed (--print)
 *
 * Output is plain text optimized for human reading. Add --json to any
 * subcommand for machine-readable output (e.g. piping into jq).
 *
 * Phase 1e deliverable. Makes the KG inspectable from a terminal so
 * coaches authoring new primitives (in Phase 6+ YAML world) or
 * engineers debugging "why isn't this concept matching" can see the
 * catalog state without grepping TypeScript files.
 */

import { FOOTBALL_KG } from "../../src/domain/football-kg/defs/index";
import { validateKG } from "../../src/domain/football-kg/load";

/* ------------------------------------------------------------------ */
/*  list                                                               */
/* ------------------------------------------------------------------ */

type FamilyName = "routes" | "formations" | "schemes" | "concepts" | "reactor-patterns" | "drills" | "all";

const FAMILY_DISPLAY: Record<Exclude<FamilyName, "all">, string> = {
  routes: "Routes",
  formations: "Formations",
  schemes: "Defensive Schemes",
  concepts: "Concepts",
  "reactor-patterns": "Reactor Patterns",
  drills: "Drills",
};

function listFamily(family: Exclude<FamilyName, "all">, asJson: boolean): void {
  const arr =
    family === "routes" ? FOOTBALL_KG.routes
    : family === "formations" ? FOOTBALL_KG.formations
    : family === "schemes" ? FOOTBALL_KG.schemes
    : family === "concepts" ? FOOTBALL_KG.concepts
    : family === "reactor-patterns" ? FOOTBALL_KG.reactorPatterns
    : FOOTBALL_KG.drills;
  if (asJson) {
    process.stdout.write(JSON.stringify(arr, null, 2));
    return;
  }
  console.log(`\n── ${FAMILY_DISPLAY[family]} (${arr.length}) ──`);
  for (const item of arr) {
    const desc = "description" in item ? item.description : "";
    const variantsStr = "variants" in item && Array.isArray(item.variants) ? `[${item.variants.join(", ")}]` : "";
    console.log(`  ${item.id.padEnd(28)} ${variantsStr.padEnd(50)} ${desc.slice(0, 90)}${desc.length > 90 ? "..." : ""}`);
  }
}

function listAll(asJson: boolean): void {
  if (asJson) {
    process.stdout.write(JSON.stringify(FOOTBALL_KG, null, 2));
    return;
  }
  const families: Array<Exclude<FamilyName, "all">> = [
    "routes", "formations", "schemes", "concepts", "reactor-patterns", "drills",
  ];
  for (const f of families) listFamily(f, false);
  const total = FOOTBALL_KG.routes.length + FOOTBALL_KG.formations.length + FOOTBALL_KG.schemes.length +
                FOOTBALL_KG.concepts.length + FOOTBALL_KG.reactorPatterns.length + FOOTBALL_KG.drills.length;
  console.log(`\n── Total: ${total} primitives ──\n`);
}

/* ------------------------------------------------------------------ */
/*  audit                                                              */
/* ------------------------------------------------------------------ */

type AuditFinding = { severity: "warn" | "info"; family: string; message: string };

function audit(asJson: boolean): void {
  const findings: AuditFinding[] = [];

  // 1. Variant coverage. Every family should have representation across
  // every variant (or at minimum across flag_5v5, flag_7v7, tackle_11).
  const requiredVariants = ["flag_5v5", "flag_7v7", "tackle_11"];
  for (const variant of requiredVariants) {
    const familiesWithVariant = [
      ["routes", FOOTBALL_KG.routes],
      ["formations", FOOTBALL_KG.formations],
      ["schemes", FOOTBALL_KG.schemes],
      ["concepts", FOOTBALL_KG.concepts],
      ["reactor-patterns", FOOTBALL_KG.reactorPatterns],
    ] as const;
    for (const [familyName, items] of familiesWithVariant) {
      const count = items.filter((i) => "variants" in i && i.variants.includes(variant as never)).length;
      if (count === 0) {
        findings.push({
          severity: "warn",
          family: familyName,
          message: `Zero ${familyName} entries apply to variant "${variant}".`,
        });
      } else if (count < 3) {
        // (drills are filtered out of `familiesWithVariant` already; this
        // branch fires for sparse non-drill families.)
        findings.push({
          severity: "info",
          family: familyName,
          message: `Only ${count} ${familyName} entries for variant "${variant}" (consider expanding).`,
        });
      }
    }
  }

  // 2. Concepts without a default formation that exists in the KG —
  // already caught by validateKG but surfaced here as info.
  const formationIds = new Set(FOOTBALL_KG.formations.map((f) => f.id));
  for (const c of FOOTBALL_KG.concepts) {
    if (!formationIds.has(c.defaultFormation.id)) {
      findings.push({
        severity: "warn",
        family: "concepts",
        message: `Concept "${c.id}" references missing formation "${c.defaultFormation.id}".`,
      });
    }
  }

  // 3. Reactor patterns without coverage in every variant's matching scheme.
  // E.g., if F7 has Tampa 2 reactors for Mesh, do we also have F5 / T11?
  // This is informational — not every scheme has every concept's reactor.
  const reactorIndex = new Map<string, Set<string>>(); // variant → set of "schemeId/conceptId"
  for (const r of FOOTBALL_KG.reactorPatterns) {
    if (!reactorIndex.has(r.variant)) reactorIndex.set(r.variant, new Set());
    reactorIndex.get(r.variant)!.add(`${r.schemeId}/${r.conceptId}`);
  }
  // Compare across variants: a concept covered in F7 but not F5 might be a gap.
  const conceptsByVariant = new Map<string, Set<string>>();
  for (const r of FOOTBALL_KG.reactorPatterns) {
    if (!conceptsByVariant.has(r.variant)) conceptsByVariant.set(r.variant, new Set());
    if (r.conceptId !== "*") conceptsByVariant.get(r.variant)!.add(r.conceptId);
  }
  const f7Concepts = conceptsByVariant.get("flag_7v7") ?? new Set();
  const f5Concepts = conceptsByVariant.get("flag_5v5") ?? new Set();
  const t11Concepts = conceptsByVariant.get("tackle_11") ?? new Set();
  for (const c of f7Concepts) {
    if (!f5Concepts.has(c)) {
      findings.push({ severity: "info", family: "reactor-patterns", message: `F7 has reactors for "${c}" but F5 doesn't.` });
    }
    if (!t11Concepts.has(c)) {
      findings.push({ severity: "info", family: "reactor-patterns", message: `F7 has reactors for "${c}" but T11 doesn't.` });
    }
  }

  // 4. KG cross-ref validation — surfaces any structural problems.
  const validation = validateKG(FOOTBALL_KG);
  if (!validation.ok) {
    for (const e of validation.errors) {
      findings.push({ severity: "warn", family: e.family, message: `${e.id}: ${e.message}` });
    }
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ findings, ok: validation.ok }, null, 2));
    return;
  }

  console.log("\n── KG Audit ──");
  const warns = findings.filter((f) => f.severity === "warn");
  const infos = findings.filter((f) => f.severity === "info");
  if (warns.length === 0) {
    console.log("✓ No warnings — KG passes structural checks.");
  } else {
    console.log(`✗ ${warns.length} warning${warns.length === 1 ? "" : "s"}:`);
    for (const w of warns) {
      console.log(`  WARN [${w.family}] ${w.message}`);
    }
  }
  if (infos.length > 0) {
    console.log(`\nℹ ${infos.length} informational note${infos.length === 1 ? "" : "s"} (gaps that may be worth filling):`);
    for (const i of infos) {
      console.log(`  INFO [${i.family}] ${i.message}`);
    }
  }
  console.log();
}

/* ------------------------------------------------------------------ */
/*  validate                                                           */
/* ------------------------------------------------------------------ */

function validate(asJson: boolean): void {
  const result = validateKG(FOOTBALL_KG);
  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2));
    return;
  }
  if (result.ok) {
    console.log(`\n✓ KG passes all schema + cross-reference + geometry validation.`);
    console.log(`  ${FOOTBALL_KG.routes.length} routes, ${FOOTBALL_KG.formations.length} formations, ${FOOTBALL_KG.schemes.length} schemes, ${FOOTBALL_KG.concepts.length} concepts, ${FOOTBALL_KG.reactorPatterns.length} reactor patterns, ${FOOTBALL_KG.drills.length} drills.\n`);
    return;
  }
  console.log(`\n✗ KG validation failed (${result.errors.length} errors):`);
  for (const e of result.errors) {
    console.log(`  [${e.family}/${e.id}] ${e.message}`);
  }
  console.log();
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  main                                                               */
/* ------------------------------------------------------------------ */

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const positionals = args.filter((a) => !a.startsWith("--"));
  const cmd = positionals[0] ?? "help";

  switch (cmd) {
    case "list": {
      const family = (positionals[1] ?? "all") as FamilyName;
      if (family === "all") {
        listAll(asJson);
      } else if (family in FAMILY_DISPLAY) {
        listFamily(family as Exclude<FamilyName, "all">, asJson);
      } else {
        console.error(`Unknown family "${family}". Valid: ${Object.keys(FAMILY_DISPLAY).join(", ")}, all`);
        process.exit(1);
      }
      break;
    }
    case "audit":
      audit(asJson);
      break;
    case "validate":
      validate(asJson);
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(`Football KG CLI

Usage:
  npx tsx scripts/fb-kg/cli.ts <command> [args] [--json]

Commands:
  list [family]     Dump catalog contents. Family one of:
                    routes, formations, schemes, concepts, reactor-patterns, drills, all
  audit             Gaps + completeness report (warnings + informational notes)
  validate          Run KG schema + cross-reference validators

Flags:
  --json            Machine-readable output instead of human-readable

Examples:
  npx tsx scripts/fb-kg/cli.ts list concepts
  npx tsx scripts/fb-kg/cli.ts audit
  npx tsx scripts/fb-kg/cli.ts list --json | jq '.routes | length'
`);
      break;
    default:
      console.error(`Unknown command "${cmd}". Run 'npx tsx scripts/fb-kg/cli.ts help' for usage.`);
      process.exit(1);
  }
}

main();
