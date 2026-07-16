import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Refuse-don't-clobber on savePlayVersionAction.
 *
 * Before this, EVERY play save was a full-document last-writer-wins overwrite:
 * the action re-read the server head at save time and used THAT as the parent,
 * so a stale document (a draft composed offline at halftime, replayed on the
 * drive home) would (a) revert whatever a co-coach had done in the meantime and
 * (b) record the new version with parent_version_id = the co-coach's version —
 * so the history would assert this coach had SEEN an edit they never saw.
 *
 * Now a caller can say what it edited FROM. The asymmetry is deliberate:
 *  - omit baseVersionId  → historical last-writer-wins (every existing caller,
 *                          unchanged; passing it is opt-in)
 *  - pass baseVersionId  → refuse when the head moved, and hand back who moved it
 *
 * Refusing is safe BECAUSE the coach's work is already durable on-device: the
 * draft is written to IndexedDB before any network call and is only cleared on a
 * confirmed ok. So "refused" costs nothing and destroys nothing.
 */

const getUserMock = vi.fn();
const playSingle = vi.fn();
const versionMaybeSingle = vi.fn();
const recordPlayVersionMock = vi.fn();
const updateEq = vi.fn();

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseEnv: () => true }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => getUserMock() },
    from: (table: string) => {
      if (table === "plays") {
        return {
          select: () => ({ eq: () => ({ single: () => playSingle() }) }),
          update: () => ({ eq: (...a: unknown[]) => updateEq(...a) }),
        };
      }
      if (table === "play_versions") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => versionMaybeSingle() }) }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  })),
}));

vi.mock("@/lib/versions/play-version-writer", () => ({
  recordPlayVersion: (...a: unknown[]) => recordPlayVersionMock(...a),
}));

// The billing/lock preamble runs before the head check and isn't what's under
// test: no owner → the lock branches are skipped entirely.
vi.mock("@/lib/billing/owner-entitlement", () => ({
  getPlaybookOwnerId: vi.fn(async () => null),
  getPlaybookOwnerEntitlement: vi.fn(async () => null),
}));
vi.mock("@/lib/billing/downgrade-locks", () => ({
  assertNotLocked: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/game-mode/assert-no-active-session", () => ({
  assertNoActiveGameSession: vi.fn(async () => ({ ok: true })),
}));
// Fires only AFTER a successful write; needs a service-role client we don't have
// in unit tests and isn't what's under test.
vi.mock("@/lib/site/example-playbooks", () => ({
  revalidateExampleSurfacesIfPublicPlaybook: vi.fn(async () => {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  // plays.ts pulls in play-cap.ts transitively, which wraps a fetch in
  // unstable_cache at module scope. Pass the fn straight through.
  unstable_cache: (fn: unknown) => fn,
}));

import { savePlayVersionAction } from "./plays";
import type { PlayDocument } from "@/domain/play/types";

const DOC = {
  metadata: {
    coachName: "Mesh",
    shorthand: null,
    wristbandCode: null,
    formation: null,
    tags: [],
    sheetAbbrev: null,
    playType: "offense",
  },
  layers: { players: [] },
} as unknown as PlayDocument;

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "coach-a" } }, error: null });
  // The server head is v2 — a co-coach moved it while we were offline on v1.
  playSingle.mockResolvedValue({
    data: {
      id: "p1",
      playbook_id: "pb1",
      current_version_id: "v2",
      play_type: "offense",
      special_teams_unit: null,
    },
    error: null,
  });
  versionMaybeSingle.mockResolvedValue({
    data: { editor_name_snapshot: "Coach B", created_at: "2026-07-16T12:00:00Z" },
    error: null,
  });
  recordPlayVersionMock.mockResolvedValue({ ok: true, versionId: "v3" });
  updateEq.mockResolvedValue({ error: null });
});

describe("savePlayVersionAction — stale base", () => {
  it("REFUSES the write and names who moved it (no clobber, no write at all)", async () => {
    const res = await savePlayVersionAction("p1", DOC, undefined, undefined, {
      baseVersionId: "v1", // we edited from v1; the head is now v2
    });

    expect(res.ok).toBe(false);
    expect(res).toMatchObject({
      conflict: {
        serverVersionId: "v2",
        serverEditorName: "Coach B",
      },
    });
    // THE POINT: nothing was written. The co-coach's v2 survives, and no version
    // row was created claiming v2 as its parent.
    expect(recordPlayVersionMock).not.toHaveBeenCalled();
    expect(updateEq).not.toHaveBeenCalled();
  });

  it("writes normally when the base MATCHES the head", async () => {
    const res = await savePlayVersionAction("p1", DOC, undefined, undefined, {
      baseVersionId: "v2", // nobody moved
    });

    expect(res).toMatchObject({ ok: true, versionId: "v3" });
    expect(recordPlayVersionMock).toHaveBeenCalledTimes(1);
    // Parented onto the head we actually verified.
    expect(recordPlayVersionMock.mock.calls[0][0]).toMatchObject({
      parentVersionId: "v2",
    });
  });

  it("OMITTING the base keeps the historical last-writer-wins (existing callers unchanged)", async () => {
    const res = await savePlayVersionAction("p1", DOC);

    expect(res).toMatchObject({ ok: true, versionId: "v3" });
    expect(recordPlayVersionMock).toHaveBeenCalledTimes(1);
  });

  it("a first-ever save (base null, head null) is not a conflict", async () => {
    playSingle.mockResolvedValue({
      data: {
        id: "p1",
        playbook_id: "pb1",
        current_version_id: null,
        play_type: "offense",
        special_teams_unit: null,
      },
      error: null,
    });

    const res = await savePlayVersionAction("p1", DOC, undefined, undefined, {
      baseVersionId: null,
    });

    expect(res).toMatchObject({ ok: true });
    expect(recordPlayVersionMock).toHaveBeenCalledTimes(1);
  });

  it("base null but head EXISTS → conflict (we'd be overwriting a play we never loaded)", async () => {
    const res = await savePlayVersionAction("p1", DOC, undefined, undefined, {
      baseVersionId: null,
    });

    expect(res.ok).toBe(false);
    expect(recordPlayVersionMock).not.toHaveBeenCalled();
  });
});
