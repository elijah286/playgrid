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
});
