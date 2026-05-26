// Resolver tests. The override branch requires a Supabase mock to
// exercise — we shim `loadLibraryOverride` and assert the resolver
// hands back the override-derived spec. The skeleton fallthrough is
// covered by simply NOT mocking the override (returns null) and
// asserting we get the same shape `generateConceptSkeleton` returns.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks need to be defined before the module under test
// imports them. Vitest's `vi.mock` is itself hoisted.
vi.mock("@/lib/learn/overrides", () => ({
  loadLibraryOverride: vi.fn(),
}));

import { resolveConceptSkeleton } from "./concept-resolver";
import { loadLibraryOverride } from "@/lib/learn/overrides";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";

describe("resolveConceptSkeleton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls through to generateConceptSkeleton when no override exists", async () => {
    (loadLibraryOverride as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const result = await resolveConceptSkeleton("Mesh", {
      variant: "flag_5v5",
      strength: "right",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.concept).toBe("Mesh");
      expect(result.isOverride).toBe(false);
      // Skeleton always produces at least one assignment.
      expect(result.spec.assignments.length).toBeGreaterThan(0);
    }
  });

  it("falls through to skeleton when strength is left (overrides are right-only today)", async () => {
    const loadFn = loadLibraryOverride as unknown as ReturnType<typeof vi.fn>;
    const result = await resolveConceptSkeleton("Mesh", {
      variant: "flag_5v5",
      strength: "left",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isOverride).toBe(false);
    }
    // Override lookup is skipped entirely when strength is "left".
    expect(loadFn).not.toHaveBeenCalled();
  });

  it("returns isOverride=true and an override-derived spec when one exists", async () => {
    // Real skeleton output is the easiest way to produce a valid
    // override.document — we generate one synchronously, save it as
    // the "override," and assert the resolver returns that path.
    const sk = generateConceptSkeleton("Mesh", {
      variant: "flag_5v5",
      strength: "right",
    });
    expect(sk.ok).toBe(true);
    if (!sk.ok) return;
    const { diagram } = playSpecToCoachDiagram(sk.spec);
    const doc = coachDiagramToPlayDocument(diagram);

    (loadLibraryOverride as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      slug: "mesh",
      variant: "flag_5v5",
      document: doc,
      coachNotes: "custom admin notes for mesh",
      updatedAt: "2026-05-26T00:00:00.000Z",
      updatedBy: null,
    });
    const result = await resolveConceptSkeleton("Mesh", {
      variant: "flag_5v5",
      strength: "right",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isOverride).toBe(true);
      // Custom admin notes take precedence over the spec-projected default.
      expect(result.notes).toBe("custom admin notes for mesh");
      expect(result.spec.assignments.length).toBeGreaterThan(0);
    }
  });

  it("preserves the failure branch when the concept name is unknown", async () => {
    (loadLibraryOverride as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const result = await resolveConceptSkeleton("Not A Real Concept", {
      variant: "flag_5v5",
      strength: "right",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.availableConcepts.length).toBeGreaterThan(0);
    }
  });
});
