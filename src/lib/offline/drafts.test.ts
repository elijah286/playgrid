import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The drafts store holds the ONLY copy of work the server hasn't confirmed.
 * Every other store here is a disposable mirror of server truth; this one isn't.
 *
 * Founder rule (2026-07-16): "There should never be a scenario or a situation
 * where a coach makes a change and it isn't saved."
 *
 * What made this necessary: the editor became fully editable offline while every
 * save stayed a server action with no catch. Offline the save REJECTS ("Load
 * failed") instead of returning ok:false, so nothing surfaced, and the document
 * — which lived only in React state — died at unmount, or with the WebView when
 * iOS reclaimed it. Three plays edited at halftime → likely zero survived the
 * drive home, with no warning at any step.
 *
 * These pin the store's contract. The rule the editor must honour, tested
 * separately at the call site: a draft is cleared ONLY on a confirmed server
 * write — never optimistically, never on a timeout.
 */

type Row = Record<string, unknown>;
const stores: Record<string, Map<string, Row>> = {};
let upgradeCreated: string[] = [];

/** Fire on the next MACROTASK so handlers attach first — the shape db.test.ts
 *  already proved works against this module. */
const fire = (fn: () => void) => setTimeout(fn, 0);

function req<T>(result: T) {
  const r: Record<string, unknown> = { result };
  fire(() => (r.onsuccess as (() => void) | undefined)?.());
  return r as unknown as IDBRequest<T>;
}

function makeStore(name: string) {
  stores[name] ??= new Map();
  const m = stores[name]!;
  return {
    put: (v: Row) => {
      m.set(String(v.playId ?? v.id), v);
      return req(undefined);
    },
    get: (k: string) => req(m.get(k)),
    getAll: () => req([...m.values()]),
    delete: (k: string) => {
      m.delete(k);
      return req(undefined);
    },
    index: () => ({ getAllKeys: () => req([]) }),
    // Required: onupgradeneeded calls createIndex on the plays/documents
    // stores. Omitting it threw inside the upgrade handler, so `open` never
    // resolved and every case timed out.
    createIndex: () => undefined,
  };
}

function fakeIndexedDb() {
  const db = {
    objectStoreNames: {
      contains: (n: string) => upgradeCreated.includes(n),
    },
    createObjectStore: (n: string) => {
      upgradeCreated.push(n);
      stores[n] ??= new Map();
      return makeStore(n);
    },
    transaction: () => {
      // db.ts awaits each put FIRST, then assigns t.oncomplete and awaits that.
      // Scheduling oncomplete at transaction-creation raced ahead of the
      // assignment and hung. Firing on ASSIGNMENT is order-independent.
      const t: Record<string, unknown> = {
        objectStore: (n: string) => makeStore(n),
        onerror: null,
        onabort: null,
      };
      Object.defineProperty(t, "oncomplete", {
        set(fn: (() => void) | null) {
          if (fn) fire(fn);
        },
        get() {
          return null;
        },
      });
      return t;
    },
  };
  return {
    open: () => {
      const r: Record<string, unknown> = { result: db };
      fire(() => {
        (r.onupgradeneeded as (() => void) | undefined)?.();
        (r.onsuccess as (() => void) | undefined)?.();
      });
      return r;
    },
  };
}

beforeEach(() => {
  for (const k of Object.keys(stores)) delete stores[k];
  upgradeCreated = [];
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.stubGlobal("indexedDB", fakeIndexedDb());
  // removeCachedPlaybook range-scans its playbookId index; Node has no
  // IDBKeyRange. Our fake index returns no keys anyway — this just has to exist.
  vi.stubGlobal("IDBKeyRange", { only: (v: unknown) => v });
  // NB: no `window` stub. Node has none, and notifyCacheChanged already guards
  // on `typeof window === "undefined"`. Stubbing a half-window here made every
  // case hang.
});

const draft = {
  playId: "p1",
  playbookId: "pb-1",
  document: { players: [{ id: "QB" }] },
  baseVersionId: "v1",
  updatedAt: "2026-07-16T10:00:00.000Z",
};

describe("play drafts — the only copy of unsaved work", () => {
  it("the v2 upgrade CREATES the drafts store without dropping the existing ones", async () => {
    const { getPlayDraft } = await import("./db");
    await getPlayDraft("p1");
    // Additive: an upgrade must never cost a coach a downloaded playbook.
    expect(upgradeCreated).toContain("drafts");
    expect(upgradeCreated).toContain("playbooks");
    expect(upgradeCreated).toContain("plays");
    expect(upgradeCreated).toContain("documents");
  });

  it("round-trips a draft WITH its base version", async () => {
    const { putPlayDraft, getPlayDraft } = await import("./db");
    await putPlayDraft(draft);

    const got = await getPlayDraft("p1");
    expect(got).toEqual(draft);
    // The base is the whole point: without it a later upload can't tell
    // "I changed nothing" from "we both changed it" and would prompt coaches
    // who merely opened a play.
    expect(got!.baseVersionId).toBe("v1");
  });

  it("a later edit overwrites the same play's draft (one pending edit per play)", async () => {
    const { putPlayDraft, listPlayDrafts } = await import("./db");
    await putPlayDraft(draft);
    await putPlayDraft({ ...draft, document: { players: [{ id: "RB" }] } });

    const all = await listPlayDrafts();
    expect(all).toHaveLength(1);
    expect(all[0]!.document).toEqual({ players: [{ id: "RB" }] });
  });

  it("lists drafts oldest-first so a flush uploads them in the order made", async () => {
    const { putPlayDraft, listPlayDrafts } = await import("./db");
    await putPlayDraft({ ...draft, playId: "p2", updatedAt: "2026-07-16T11:00:00.000Z" });
    await putPlayDraft({ ...draft, playId: "p1", updatedAt: "2026-07-16T09:00:00.000Z" });

    expect((await listPlayDrafts()).map((d) => d.playId)).toEqual(["p1", "p2"]);
  });

  it("removal is explicit and scoped to one play", async () => {
    const { putPlayDraft, removePlayDraft, getPlayDraft } = await import("./db");
    await putPlayDraft(draft);
    await putPlayDraft({ ...draft, playId: "p2" });

    await removePlayDraft("p1");

    expect(await getPlayDraft("p1")).toBeNull();
    // A confirmed save for one play must never touch another's pending work.
    expect(await getPlayDraft("p2")).not.toBeNull();
  });

  it("removing a playbook from offline does NOT destroy unsaved drafts", async () => {
    const { putPlayDraft, removeCachedPlaybook, getPlayDraft } = await import("./db");
    await putPlayDraft(draft);

    // "Remove from offline" discards a MIRROR of server truth. A draft is not
    // that — it's work the server has never seen. It must survive and upload.
    await removeCachedPlaybook("pb-1");

    expect(await getPlayDraft("p1")).not.toBeNull();
  });
});
