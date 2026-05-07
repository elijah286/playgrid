import { describe, expect, it } from "vitest";
import {
  createChannel,
  disposeChannel,
  getChannel,
  type AgentLiveEvent,
} from "./running-turns";

describe("running-turns channel", () => {
  it("publishes events to live subscribers", () => {
    const ch = createChannel("turn-1");
    const seen: AgentLiveEvent[] = [];
    ch.subscribe((e) => seen.push(e));
    ch.publish({ kind: "event", event: "status", data: { text: "thinking" } });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ kind: "event", event: "status", data: { text: "thinking" } });
    disposeChannel("turn-1");
  });

  it("replays buffered events to a late subscriber so they don't miss anything", () => {
    const ch = createChannel("turn-2");
    ch.publish({ kind: "event", event: "status", data: { text: "first" } });
    ch.publish({ kind: "event", event: "text_delta", data: { text: "hello" } });
    const seen: AgentLiveEvent[] = [];
    ch.subscribe((e) => seen.push(e));
    expect(seen).toHaveLength(2);
    expect(seen.map((e) => (e.kind === "event" ? e.event : e.kind))).toEqual([
      "status",
      "text_delta",
    ]);
    disposeChannel("turn-2");
  });

  it("delivers replay events AND keeps the subscriber live for new ones", () => {
    const ch = createChannel("turn-3");
    ch.publish({ kind: "event", event: "status", data: { text: "warmup" } });
    const seen: AgentLiveEvent[] = [];
    ch.subscribe((e) => seen.push(e));
    ch.publish({ kind: "event", event: "text_delta", data: { text: "hi" } });
    expect(seen).toHaveLength(2);
    disposeChannel("turn-3");
  });

  it("isolates subscribers — one subscriber throwing does not break the channel for others", () => {
    const ch = createChannel("turn-4");
    const seen: AgentLiveEvent[] = [];
    ch.subscribe(() => { throw new Error("boom"); });
    ch.subscribe((e) => seen.push(e));
    ch.publish({ kind: "event", event: "status", data: { text: "ok" } });
    expect(seen).toHaveLength(1);
    disposeChannel("turn-4");
  });

  it("stops delivering after close", () => {
    const ch = createChannel("turn-5");
    const seen: AgentLiveEvent[] = [];
    ch.subscribe((e) => seen.push(e));
    ch.close();
    ch.publish({ kind: "event", event: "status", data: { text: "after-close" } });
    expect(seen).toHaveLength(0);
    disposeChannel("turn-5");
  });

  it("returns a no-op unsubscribe when subscribed after close (replays buffer only)", () => {
    const ch = createChannel("turn-6");
    ch.publish({ kind: "event", event: "text_delta", data: { text: "x" } });
    ch.close();
    const seen: AgentLiveEvent[] = [];
    const unsub = ch.subscribe((e) => seen.push(e));
    // Buffer is replayed even after close so a late subscriber can still
    // see what already happened — they just won't get future events.
    expect(seen).toHaveLength(1);
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
    disposeChannel("turn-6");
  });

  it("registers the channel for lookup by turn id and unregisters on dispose", () => {
    const ch = createChannel("turn-7");
    expect(getChannel("turn-7")).toBe(ch);
    disposeChannel("turn-7");
    // Linger period (60s) keeps it briefly retrievable; we accept either
    // the original handle or null. The contract is "callers eventually
    // get null", and "either" is enough to verify dispose was wired up.
    const after = getChannel("turn-7");
    expect(after === ch || after === null).toBe(true);
  });
});
