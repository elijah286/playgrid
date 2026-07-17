/**
 * Adding a player back after deleting one.
 *
 * The formation editor could delete players but not add them — `player.add`,
 * the reducer case, and EditorCanvas's `onAddPlayer` hook all existed, but
 * nothing passed the hook, so the entire path was dead code and a coach who
 * deleted a player had no way to recover short of abandoning the formation.
 *
 * The three mk* player factories are private, so a caller had no correct way
 * to build a player anyway. newPlayerForKind is the one supported way.
 */
import { describe, expect, it } from "vitest";
import {
  createEmptyPlayDocument,
  defaultDefendersForVariant,
  newPlayerForKind,
  sportProfileForVariant,
} from "./factory";
import { applyCommand } from "./reducer";
import type { PlayDocument } from "./types";

describe("newPlayerForKind", () => {
  it("gives each side its own glyph — a new defender is a triangle, not a circle", () => {
    expect(newPlayerForKind("offense", { x: 0.5, y: 0.3 }, []).shape ?? "circle").toBe("circle");
    expect(newPlayerForKind("defense", { x: 0.5, y: 0.6 }, []).shape).toBe("triangle");
    expect(newPlayerForKind("special_teams", { x: 0.5, y: 0.3 }, []).shape).toBe("square");
  });

  it("gives each side a role from its own set", () => {
    expect(newPlayerForKind("defense", { x: 0.5, y: 0.6 }, []).role).toBe("LB");
    expect(newPlayerForKind("special_teams", { x: 0.5, y: 0.3 }, []).role).toBe("ST");
    // Offense can't be guessed — OTHER is honest rather than a fake WR.
    expect(newPlayerForKind("offense", { x: 0.5, y: 0.3 }, []).role).toBe("OTHER");
  });

  it("never collides with an existing id — routes address their carrier by id", () => {
    let roster = defaultDefendersForVariant("flag_5v5");
    for (let i = 0; i < 5; i++) {
      const next = newPlayerForKind("defense", { x: 0.5, y: 0.6 }, roster);
      expect(roster.some((p) => p.id === next.id)).toBe(false);
      roster = [...roster, next];
    }
    expect(new Set(roster.map((p) => p.id)).size).toBe(roster.length);
  });

  it("keeps the position it's given", () => {
    const p = newPlayerForKind("defense", { x: 0.25, y: 0.72 }, []);
    expect(p.position).toEqual({ x: 0.25, y: 0.72 });
  });
});

describe("delete then add back", () => {
  function defensiveDoc(): PlayDocument {
    const doc = createEmptyPlayDocument({ sportProfile: sportProfileForVariant("flag_5v5") });
    return {
      ...doc,
      metadata: { ...doc.metadata, playType: "defense" as const },
      layers: { ...doc.layers, players: defaultDefendersForVariant("flag_5v5") },
    };
  }

  it("restores the roster a coach deleted from", () => {
    let doc = defensiveDoc();
    expect(doc.layers.players).toHaveLength(5);

    doc = applyCommand(doc, { type: "player.remove", playerId: doc.layers.players[0].id });
    expect(doc.layers.players).toHaveLength(4);

    doc = applyCommand(doc, {
      type: "player.add",
      player: newPlayerForKind("defense", { x: 0.5, y: 0.6 }, doc.layers.players),
    });
    expect(doc.layers.players).toHaveLength(5);
    expect(doc.layers.players.at(-1)!.shape).toBe("triangle");
  });

  it("can exceed the game type's count — the editor warns rather than blocks", () => {
    // 5v5 fields 5. A coach mid-thought may briefly have 6; that's a warning,
    // not something the document model should refuse.
    let doc = defensiveDoc();
    doc = applyCommand(doc, {
      type: "player.add",
      player: newPlayerForKind("defense", { x: 0.5, y: 0.6 }, doc.layers.players),
    });
    expect(doc.layers.players).toHaveLength(6);
    expect(doc.sportProfile.defensePlayerCount).toBe(5);
  });
});
