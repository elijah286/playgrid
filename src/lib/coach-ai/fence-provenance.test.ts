/**
 * Phase 2b tests — fence provenance gate.
 *
 * Pins the contract: every `\`\`\`play` fence in Cal's reply must
 * have come from a tool call or a spec render. Hand-authored fences
 * fail the gate and trigger a retry critique that points Cal at the
 * spec-emission path.
 */

import { describe, expect, it } from "vitest";
import {
  ApprovedFenceTracker,
  fingerprintFence,
  validateFenceProvenance,
  fenceProvenanceCritique,
} from "./fence-provenance";

describe("fingerprintFence — canonicalization", () => {
  it("produces the same fingerprint for whitespace-different inputs", () => {
    const a = '{"a":1,"b":[2,3]}';
    const b = `{
      "a": 1,
      "b": [ 2, 3 ]
    }`;
    expect(fingerprintFence(a)).toBe(fingerprintFence(b));
  });

  it("produces the same fingerprint regardless of key order", () => {
    const a = '{"a":1,"b":2,"c":3}';
    const b = '{"c":3,"b":2,"a":1}';
    expect(fingerprintFence(a)).toBe(fingerprintFence(b));
  });

  it("produces DIFFERENT fingerprints for actual content changes", () => {
    expect(fingerprintFence('{"a":1}')).not.toBe(fingerprintFence('{"a":2}'));
    expect(fingerprintFence('{"a":[1,2]}')).not.toBe(fingerprintFence('{"a":[1,3]}'));
  });

  it("normalizes nested structures recursively", () => {
    const a = '{"players":[{"id":"X","x":0,"y":0}]}';
    const b = '{"players":[{"y":0,"x":0,"id":"X"}]}';
    expect(fingerprintFence(a)).toBe(fingerprintFence(b));
  });

  it("returns null for invalid JSON", () => {
    expect(fingerprintFence("not json")).toBeNull();
    expect(fingerprintFence("")).toBeNull();
    expect(fingerprintFence("   ")).toBeNull();
  });
});

describe("ApprovedFenceTracker", () => {
  it("starts empty", () => {
    const tracker = new ApprovedFenceTracker();
    expect(tracker.size).toBe(0);
    expect(tracker.contains('{"a":1}')).toBe(false);
  });

  it("approves a fence and recognizes it later", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve('{"a":1,"b":2}');
    expect(tracker.size).toBe(1);
    expect(tracker.contains('{"a":1,"b":2}')).toBe(true);
  });

  it("recognizes approved fences across whitespace + key-order variants", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve('{"a":1,"b":2}');
    // Same content, different formatting:
    expect(tracker.contains('{\n  "b": 2,\n  "a": 1\n}')).toBe(true);
  });

  it("rejects fences with different content", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve('{"a":1}');
    expect(tracker.contains('{"a":2}')).toBe(false);
  });

  it("deduplicates equivalent approvals", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve('{"a":1,"b":2}');
    tracker.approve('{"b":2,"a":1}'); // same content
    expect(tracker.size).toBe(1);
  });

  it("silently skips invalid JSON (the malformed-fence gate handles it separately)", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve("not json");
    expect(tracker.size).toBe(0);
  });
});

describe("validateFenceProvenance — gate behavior", () => {
  it("passes when there are no fences in the text", () => {
    const tracker = new ApprovedFenceTracker();
    expect(validateFenceProvenance("Just prose, no fences.", tracker).ok).toBe(true);
    expect(validateFenceProvenance("", tracker).ok).toBe(true);
  });

  it("passes when every fence in the text is approved", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve('{"a":1}');
    tracker.approve('{"b":2}');
    const text = '```play\n{"a":1}\n```\nMore text.\n```play\n{"b":2}\n```';
    expect(validateFenceProvenance(text, tracker).ok).toBe(true);
  });

  it("rejects when a fence is hand-authored (not in approved set)", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve('{"a":1}');
    const text = '```play\n{"a":1}\n```\n```play\n{"hand":"authored"}\n```';
    const result = validateFenceProvenance(text, tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.handAuthoredFences).toHaveLength(1);
      expect(result.handAuthoredFences[0]).toContain('"hand"');
    }
  });

  it("rejects all hand-authored fences when there are multiple", () => {
    const tracker = new ApprovedFenceTracker();
    const text = '```play\n{"a":1}\n```\n```play\n{"b":2}\n```\n```play\n{"c":3}\n```';
    const result = validateFenceProvenance(text, tracker);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.handAuthoredFences.length).toBe(3);
  });

  it("treats whitespace-different versions of an approved fence as approved", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve('{"a":1,"b":[2,3]}');
    // Same content, different whitespace formatting from Cal:
    const text = '```play\n{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n```';
    expect(validateFenceProvenance(text, tracker).ok).toBe(true);
  });

  it("treats a fence with REORDERED keys as the same as the approved version (canonical fingerprint)", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve('{"players":[{"id":"X","x":0,"y":0}],"routes":[]}');
    const text = '```play\n{"routes":[],"players":[{"y":0,"x":0,"id":"X"}]}\n```';
    expect(validateFenceProvenance(text, tracker).ok).toBe(true);
  });

  it("rejects when Cal subtly mutates approved content (changed a coordinate)", () => {
    const tracker = new ApprovedFenceTracker();
    tracker.approve('{"players":[{"id":"X","x":-10,"y":0}]}');
    // Same shape, but Cal moved X from -10 to -7 — should fail
    const text = '```play\n{"players":[{"id":"X","x":-7,"y":0}]}\n```';
    const result = validateFenceProvenance(text, tracker);
    expect(result.ok).toBe(false);
  });
});

describe("fenceProvenanceCritique — surfaces the spec-emission path", () => {
  it("mentions spec block emission as the fix", () => {
    const c = fenceProvenanceCritique(1);
    expect(c).toContain("```spec");
    expect(c).toContain("compose_play");
    expect(c).toContain("forbidden");
  });

  it("uses singular vs plural correctly", () => {
    expect(fenceProvenanceCritique(1)).toContain("You emitted a ```play fence");
    expect(fenceProvenanceCritique(3)).toContain("You emitted 3 ```play fences");
  });

  it("includes both Path A (catalog concept) and Path B (formation + routes)", () => {
    // Surfaced by `bespoke-route-survives` eval 2026-05-25: when Cal
    // wants a bespoke / formation-only play (not a catalog concept),
    // compose_play can't help. The original critique only mentioned
    // the compose_play path, so Cal would either hand-author again or
    // call compose_play with a formation name. Both paths must be
    // visible in the critique.
    const c = fenceProvenanceCritique(1);
    expect(c).toMatch(/path a.*catalog concept/i);
    expect(c).toMatch(/path b.*formation.*routes/i);
    expect(c).toContain("place_offense");
  });

  it("inline spec template prefills the variant when provided", () => {
    // Without variant prefill, Cal sees `"variant": "<variant>"` and
    // has to fill it in — one LLM mistake there produces a render
    // error. With prefill, Cal only fills the formation + assignments.
    const c5 = fenceProvenanceCritique(1, { variant: "flag_5v5" });
    expect(c5).toContain('"variant": "flag_5v5"');

    const c7 = fenceProvenanceCritique(1, { variant: "flag_7v7" });
    expect(c7).toContain('"variant": "flag_7v7"');

    const cTackle = fenceProvenanceCritique(1, { variant: "tackle_11" });
    expect(cTackle).toContain('"variant": "tackle_11"');

    // No variant → placeholder remains.
    const cDefault = fenceProvenanceCritique(1);
    expect(cDefault).toContain('"variant": "<variant>"');
  });

  it("lists catalog route families for Path B fill-in", () => {
    const c = fenceProvenanceCritique(1);
    // Cal needs to know what strings are valid for `family` —
    // listing them is the difference between "Cal makes one up" and
    // "Cal picks from a known list".
    expect(c).toMatch(/slant.+post.+curl.+hitch.+go/i);
  });

  it("mentions the custom-route escape hatch for off-catalog shapes", () => {
    const c = fenceProvenanceCritique(1);
    expect(c).toMatch(/"kind":\s*"custom"/);
    expect(c).toMatch(/waypoints/i);
  });
});
