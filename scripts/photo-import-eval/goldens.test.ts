import path from "node:path";
import { describe, expect, it } from "vitest";
import { findTemplate, ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { loadGoldens } from "./goldens";
import { buildSystemPrompt } from "./prompt";
import { routeVocabularyNames } from "./schema";

const GOLDENS_FILE = path.join(__dirname, "goldens", "bomb-squad-offense-p1.json");

describe("bomb-squad goldens file", () => {
  it("loads and validates", () => {
    const sheet = loadGoldens(GOLDENS_FILE);
    expect(sheet.plays).toHaveLength(16);
    expect(sheet.grid).toMatchObject({ rows: 4, cols: 4 });
  });

  it("every golden family and alternate resolves against the route catalog", () => {
    // A typo'd family in the goldens would silently score every model
    // read of that player as a miss — fail loudly here instead.
    const sheet = loadGoldens(GOLDENS_FILE);
    const unresolved: string[] = [];
    for (const play of sheet.plays) {
      for (const a of play.assignments) {
        for (const name of [a.family, ...(a.alternates ?? [])]) {
          if (name && !findTemplate(name)) unresolved.push(`Play ${play.index} ${a.player}: "${name}"`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("route assignments carry a family and a depth", () => {
    const sheet = loadGoldens(GOLDENS_FILE);
    for (const play of sheet.plays) {
      for (const a of play.assignments) {
        if (a.kind === "route") {
          expect(a.family, `Play ${play.index} ${a.player}`).toBeTruthy();
          expect(a.depthYds, `Play ${play.index} ${a.player}`).toBeTypeOf("number");
        }
      }
    }
  });
});

describe("extraction prompt", () => {
  it("includes every catalog template by name", () => {
    const prompt = buildSystemPrompt();
    for (const t of ROUTE_TEMPLATES) {
      expect(prompt, `template ${t.name} missing from vocabulary`).toContain(`- ${t.name}`);
    }
  });

  it("tool family enum covers names and aliases", () => {
    const vocab = routeVocabularyNames();
    for (const t of ROUTE_TEMPLATES) {
      expect(vocab).toContain(t.name);
      for (const alias of t.aliases ?? []) expect(vocab).toContain(alias);
    }
  });
});
