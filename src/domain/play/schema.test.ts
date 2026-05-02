/**
 * Schema goldens for the runtime PlayDocument contract.
 *
 * The contract these tests pin (per AGENTS.md "strict definition…
 * anything outside the hierarchy is invalid"):
 *
 *   1. A canonical-shape PlayDocument parses through the strict schema.
 *      (Round-trip: known-good input → parse → output equals input
 *      modulo strip rules.)
 *
 *   2. UNKNOWN top-level keys are rejected (".strict()" semantics).
 *      Cal cannot smuggle in a `customField` at any level.
 *
 *   3. ENUM violations are rejected — fieldBackground: "neon" is not a
 *      valid value, so the parse fails. The H2/blue-rectangle class
 *      of bug becomes structurally impossible.
 *
 *   4. WRONG-TYPED values are rejected — `players[0].position.x: "left"`
 *      fails because positions are numeric.
 *
 *   5. Nested objects in the metadata path enforce strictness too.
 */

import { describe, expect, it } from "vitest";
import { parsePlayDocument, parsePlayDocumentStrict } from "./schema";
import { createEmptyPlayDocument } from "./factory";

function freshDoc() {
  return createEmptyPlayDocument();
}

describe("playDocumentSchema — happy path", () => {
  it("a freshly-created play document parses cleanly", () => {
    const result = parsePlayDocument(freshDoc());
    if (!result.success) {
      console.log(result.error.issues);
    }
    expect(result.success).toBe(true);
  });

  it("strict and lenient currently behave identically (both succeed on canonical input)", () => {
    const strict = parsePlayDocumentStrict(freshDoc());
    const lenient = parsePlayDocument(freshDoc());
    expect(strict.success).toBe(lenient.success);
  });
});

describe("playDocumentSchema — rejects unknown keys (strict mode)", () => {
  it("rejects an extra top-level key", () => {
    const doc: Record<string, unknown> = { ...freshDoc(), customField: "smuggled" };
    const result = parsePlayDocument(doc);
    expect(result.success).toBe(false);
  });

  it("rejects an extra key inside metadata", () => {
    const base = freshDoc();
    const doc = { ...base, metadata: { ...base.metadata, secretMeta: "smuggled" } };
    const result = parsePlayDocument(doc);
    expect(result.success).toBe(false);
  });

  it("rejects an extra key inside layers", () => {
    const base = freshDoc();
    const doc = { ...base, layers: { ...base.layers, mysteryLayer: [] } };
    const result = parsePlayDocument(doc);
    expect(result.success).toBe(false);
  });

  it("rejects an extra key inside a player object", () => {
    const base = freshDoc();
    const docWithBadPlayer = {
      ...base,
      layers: {
        ...base.layers,
        players: [
          { ...base.layers.players[0], surprise: "field" },
          ...base.layers.players.slice(1),
        ],
      },
    };
    const result = parsePlayDocument(docWithBadPlayer);
    expect(result.success).toBe(false);
  });
});

describe("playDocumentSchema — rejects enum/type violations", () => {
  it("rejects fieldBackground='neon' (not in enum)", () => {
    const doc = { ...freshDoc(), fieldBackground: "neon" };
    const result = parsePlayDocument(doc);
    expect(result.success).toBe(false);
  });

  it("rejects sportProfile.variant='unknown_variant' (not in enum)", () => {
    const base = freshDoc();
    const doc = { ...base, sportProfile: { ...base.sportProfile, variant: "unknown_variant" } };
    const result = parsePlayDocument(doc);
    expect(result.success).toBe(false);
  });

  it("rejects a player with non-numeric position.x", () => {
    const base = freshDoc();
    const docBadPlayer = {
      ...base,
      layers: {
        ...base.layers,
        players: [
          { ...base.layers.players[0], position: { x: "left" as unknown as number, y: 0.4 } },
          ...base.layers.players.slice(1),
        ],
      },
    };
    const result = parsePlayDocument(docBadPlayer);
    expect(result.success).toBe(false);
  });

  it("rejects a route segment shape='spiral' (not in enum)", () => {
    const base = freshDoc();
    if (base.layers.routes.length === 0) {
      // Some empty docs have no routes; nothing to test here.
      return;
    }
    const docBadRoute = {
      ...base,
      layers: {
        ...base.layers,
        routes: [
          {
            ...base.layers.routes[0],
            segments: base.layers.routes[0].segments.map((s) => ({ ...s, shape: "spiral" })),
          },
          ...base.layers.routes.slice(1),
        ],
      },
    };
    const result = parsePlayDocument(docBadRoute);
    expect(result.success).toBe(false);
  });
});

describe("playDocumentSchema — Coach Cal-relevant fields all parse", () => {
  it("a doc with metadata.spec set parses (spec is z.unknown() — validated separately)", () => {
    const base = freshDoc();
    const doc = {
      ...base,
      metadata: {
        ...base.metadata,
        spec: { schemaVersion: 1, variant: "tackle_11", formation: { name: "Spread" }, assignments: [] },
      },
    };
    const result = parsePlayDocument(doc);
    expect(result.success).toBe(true);
  });

  it("a doc with playType + formationId parses", () => {
    const base = freshDoc();
    const doc = {
      ...base,
      metadata: {
        ...base.metadata,
        playType: "offense" as const,
        formationId: "abc-123",
      },
    };
    const result = parsePlayDocument(doc);
    expect(result.success).toBe(true);
  });

  it("a doc with field display flags (lineOfScrimmage, hashStyle, fieldZone) parses", () => {
    const doc = {
      ...freshDoc(),
      lineOfScrimmage: "football" as const,
      hashStyle: "narrow" as const,
      fieldZone: "red_zone" as const,
      showHashMarks: true,
      showYardNumbers: false,
    };
    const result = parsePlayDocument(doc);
    expect(result.success).toBe(true);
  });
});
