// @vitest-environment jsdom
/**
 * A draft the coach can't get back is not saved.
 *
 * THE BUG (2026-07-16): e861ed8b built the drafts store so halftime work would
 * survive iOS reclaiming a backgrounded WebView. It delivered the write and
 * never the read — `getPlayDraft` and `listPlayDrafts` shipped with unit tests
 * (drafts.test.ts, all green) and ZERO production callers. PlayEditorClient
 * imported `putPlayDraft, removePlayDraft` and nothing else.
 *
 * So the store was a write-only sink, and the loss was worse than "stranded":
 *
 *   1. Coach edits offline. persistDraft writes doc + baseVersionId. Good.
 *   2. iOS kills the WebView. Process kill, no unmount — the case it was for.
 *   3. Coach reopens the play. The editor loads from the SERVER (nothing reads
 *      the draft), so they see the pre-halftime version. Work is invisible.
 *   4. Coach edits anything. Save succeeds → the confirmed-write branch fires
 *      removePlayDraft → the halftime work is DELETED, never once read.
 *
 * Step 4's rule ("only ever removed on a CONFIRMED server write") is sound only
 * if the draft and the in-flight save are the same lineage. Without a restore
 * they are not, so a confirmed write of server-derived content destroyed work it
 * had never looked at. Hence the tightened rule these tests pin:
 *
 *   NEVER DELETE WHAT YOU HAVEN'T READ.
 *
 * On coverage, honestly: PlayEditorClient is 3510 lines and 49 imports and is
 * not mountable, so the effect wiring itself is not covered here. The first
 * describe replicates the save/restore/clear SEQUENCE, because the sequence is
 * where the rule lives. The second is the one that would actually have caught
 * this on the day it shipped — it asserts the store's readers have callers at
 * all. A read function with no caller is the whole bug, and it is cheap to
 * detect.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

type Draft = { document: string; baseVersionId: string | null };

/**
 * The editor's draft lifecycle, reduced to the parts that decide whether work
 * survives: what a session restores, what base it uploads under, and when the
 * on-device copy may be dropped.
 */
function makeSession(opts: {
  store: Map<string, Draft>;
  playId: string;
  serverDoc: string;
  serverBase: string | null;
  /** Simulates IndexedDB refusing right after a cold launch. */
  readThrows?: boolean;
}) {
  const { store, playId, serverDoc, serverBase } = opts;
  let doc = serverDoc;
  let base = serverBase;
  let reconciled = false;
  let restored = false;

  return {
    /** Mount: read the store back before touching anything. */
    open() {
      if (opts.readThrows) return; // reconciled stays false — we did NOT read
      reconciled = true;
      const draft = store.get(playId);
      if (!draft) return;
      restored = true;
      doc = draft.document;
      // The draft's OWN base — it was composed from that version.
      base = draft.baseVersionId;
    },
    edit(next: string) {
      doc = next;
      store.set(playId, { document: doc, baseVersionId: base });
    },
    /** @returns the base the save was sent under, or null if refused. */
    save(server: { head: string | null; accept: (base: string | null) => boolean }) {
      const sentBase = base;
      if (!server.accept(sentBase)) return { ok: false as const, sentBase };
      base = server.head;
      restored = false;
      // Never delete what you haven't read.
      if (reconciled) store.delete(playId);
      return { ok: true as const, sentBase };
    },
    get doc() {
      return doc;
    },
    get restored() {
      return restored;
    },
  };
}

describe("draft restore — the write-only sink", () => {
  it("brings back work the last session couldn't upload", () => {
    const store = new Map<string, Draft>();
    // Halftime, offline: edits land on the device, the save never leaves.
    const halftime = makeSession({ store, playId: "p1", serverDoc: "v-server", serverBase: "v5" });
    halftime.open();
    halftime.edit("halftime-work");
    // WebView killed — no unmount, no flush. The draft is all that's left.
    expect(store.get("p1")?.document).toBe("halftime-work");

    // Drive home. New session, online, server still holds the old version.
    const driveHome = makeSession({ store, playId: "p1", serverDoc: "v-server", serverBase: "v5" });
    driveHome.open();

    expect(driveHome.doc, "the coach must see their halftime work, not the server's copy").toBe(
      "halftime-work",
    );
    expect(driveHome.restored).toBe(true);
  });

  it("uploads the draft under the base it was COMPOSED from, not the session's", () => {
    // This is what makes the co-coach refusal upstream able to fire at all. The
    // draft was built on v5; a co-coach has since moved the head to v7. Sending
    // v7 would be accepted and would silently revert them.
    const store = new Map<string, Draft>([["p1", { document: "halftime", baseVersionId: "v5" }]]);
    const session = makeSession({ store, playId: "p1", serverDoc: "v-server", serverBase: "v7" });
    session.open();

    const res = session.save({ head: "v8", accept: (base) => base === "v7" });

    expect(res.sentBase, "must send the DRAFT's base (v5), not the session's (v7)").toBe("v5");
    expect(res.ok, "the server refuses a stale base — the co-coach survives").toBe(false);
    expect(store.get("p1"), "a refused save destroys nothing").toBeTruthy();
  });

  it("does NOT delete a draft it never read (IndexedDB refused on cold launch)", () => {
    const store = new Map<string, Draft>([["p1", { document: "halftime", baseVersionId: "v5" }]]);
    // Cold launch: the read throws, so this session never saw the draft.
    const session = makeSession({
      store,
      playId: "p1",
      serverDoc: "v-server",
      serverBase: "v5",
      readThrows: true,
    });
    session.open();
    expect(session.doc, "no restore happened").toBe("v-server");

    session.edit("unrelated-later-edit");
    session.save({ head: "v6", accept: () => true });

    expect(
      store.get("p1"),
      "a confirmed write must not delete work this session never looked at",
    ).toBeTruthy();
  });

  it("clears the draft once the server confirms the work it restored", () => {
    const store = new Map<string, Draft>([["p1", { document: "halftime", baseVersionId: "v5" }]]);
    const session = makeSession({ store, playId: "p1", serverDoc: "v-server", serverBase: "v5" });
    session.open();
    const res = session.save({ head: "v6", accept: () => true });

    expect(res.ok).toBe(true);
    expect(store.get("p1"), "the server holds it now — the device copy is spent").toBeUndefined();
  });

  it("does not carry 'we read the store' from one play to the next", () => {
    // The editor is NOT remounted between plays (no key on
    // PlayEditorClientInner) and it soft-navigates play → play itself. So the
    // per-play refs are reset during render. Without that, opening play A —
    // which reads A's store — would leave "reconciled" true, and the first save
    // on play B would delete B's draft having never looked at it.
    const store = new Map<string, Draft>([["B", { document: "B-halftime", baseVersionId: "v1" }]]);

    const a = makeSession({ store, playId: "A", serverDoc: "A-server", serverBase: "v1" });
    a.open(); // reads A's store; A has no draft

    // Soft-nav to B. A fresh per-play session is what the render-time reset
    // models: B starts having read nothing.
    const b = makeSession({
      store,
      playId: "B",
      serverDoc: "B-server",
      serverBase: "v1",
      readThrows: true, // B's read fails — so B has NOT read the store
    });
    b.open();
    b.edit("B-later-edit");
    b.save({ head: "v2", accept: () => true });

    expect(
      store.get("B"),
      "play B's draft must survive — this session never read B's store",
    ).toBeTruthy();
  });

  it("reproduces the ORIGINAL loss when the restore is removed", () => {
    // Same sequence, minus the read-back. This is prod before this change.
    const store = new Map<string, Draft>([["p1", { document: "halftime", baseVersionId: "v5" }]]);
    const noRestore = makeSession({ store, playId: "p1", serverDoc: "v-server", serverBase: "v5" });
    // (never calls open() — exactly what PlayEditorClient did: no getPlayDraft)
    noRestore.edit("some-later-edit");
    // The old code deleted on any confirmed write, read or not.
    store.delete("p1");

    expect(store.get("p1"), "documents the bug: halftime work destroyed unread").toBeUndefined();
  });
});

/**
 * The check that would have caught this the day it shipped. A store whose read
 * functions have no callers is not a cache — it's a leak with tests.
 */
describe("the drafts store has readers", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, "..", "..");

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
    }
    return out;
  }

  const productionFiles = walk(srcRoot).filter((f) => !f.endsWith(join("lib", "offline", "db.ts")));

  /**
   * Call sites, not mentions. A substring search counts this file's own prose —
   * and counted a doc comment naming `listPlayDrafts` as a caller on the first
   * run, which is precisely the "tested but unwired" illusion being guarded
   * against, one level up.
   */
  function callersOf(fn: string): string[] {
    const call = new RegExp(String.raw`\b${fn}\s*\(`);
    return productionFiles.filter((f) => call.test(readFileSync(f, "utf8")));
  }

  it("getPlayDraft is actually called by production code", () => {
    expect(
      callersOf("getPlayDraft"),
      "a draft nobody reads is work the coach loses — wire it, don't just define it",
    ).not.toHaveLength(0);
  });

  it("documents that listPlayDrafts is still unwired (flush-on-reconnect)", () => {
    // Not a failure — a deliberate marker. listPlayDrafts exists for the
    // reconnect sweep, which is NOT built yet: restore-on-mount only recovers a
    // play the coach reopens. Until the sweep lands, SaveStatePill's "will
    // upload when you're back online" is only true for plays they revisit.
    // When the sweep ships, flip this to the same assertion as getPlayDraft.
    expect(
      callersOf("listPlayDrafts"),
      "if this now has callers, the sweep landed — tighten this test",
    ).toHaveLength(0);
  });
});
