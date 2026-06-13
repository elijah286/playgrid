import { describe, it, expect } from "vitest";
import { pickEditableFreePlaybook } from "./free-playbook";

/**
 * The dashboard hands these tiles to the "you already have your free playbook"
 * modal already sorted by updated_at descending — most recently touched first.
 * The regression: a freshly created (or just-opened) playbook floats to index
 * 0 even though it's locked beyond the free cap, so naive index-0 selection
 * pointed the modal at the wrong, locked playbook instead of the one the coach
 * can actually edit.
 */
describe("pickEditableFreePlaybook", () => {
  it("returns the unlocked playbook, not the most-recently-updated locked one", () => {
    const owned = [
      // index 0 = just created, locked beyond the free cap
      { id: "new", name: "dasfadsf", is_locked: true, is_archived: false },
      { id: "old", name: "Chiefs Girls", is_locked: false, is_archived: false },
    ];
    expect(pickEditableFreePlaybook(owned)?.id).toBe("old");
  });

  it("prefers an unlocked, non-archived playbook over an unlocked archived one", () => {
    const owned = [
      { id: "arch", name: "Archived", is_locked: false, is_archived: true },
      { id: "live", name: "Active", is_locked: false, is_archived: false },
    ];
    expect(pickEditableFreePlaybook(owned)?.id).toBe("live");
  });

  it("falls back to an unlocked archived playbook when nothing else is editable", () => {
    const owned = [
      { id: "locked", name: "Locked", is_locked: true, is_archived: false },
      { id: "arch", name: "Archived", is_locked: false, is_archived: true },
    ];
    expect(pickEditableFreePlaybook(owned)?.id).toBe("arch");
  });

  it("falls back to the first entry when every playbook is locked", () => {
    const owned = [
      { id: "a", name: "A", is_locked: true, is_archived: false },
      { id: "b", name: "B", is_locked: true, is_archived: false },
    ];
    expect(pickEditableFreePlaybook(owned)?.id).toBe("a");
  });

  it("returns null when there are no owned playbooks", () => {
    expect(pickEditableFreePlaybook([])).toBeNull();
  });
});
