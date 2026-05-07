/**
 * In-memory pub/sub channels for live Coach Cal SSE streaming.
 *
 * Why this exists
 * ---------------
 * The detached agent runs in a fire-and-forget promise that is independent
 * of the HTTP request. The SSE response is just a *tail* — it subscribes to
 * a channel, forwards events to the wire, and unsubscribes when the client
 * closes. Closing the client never aborts the agent.
 *
 * Each channel buffers all events it has seen so a late subscriber (rare —
 * essentially only the same request's reader if the agent finished before
 * the ReadableStream `start` callback fired) can replay from the beginning.
 *
 * Channels are scoped to the Node process. Across processes, the source of
 * truth is the `coach_ai_turns` row — the channel is purely a latency
 * optimization for the same-process happy path. If the process restarts
 * mid-turn, the row's `running` status will be promoted to `errored` by
 * the stale-running guard in persistence.ts.
 */

export type AgentLiveEvent =
  | { kind: "event"; event: "status"; data: { text: string } }
  | { kind: "event"; event: "tool_call"; data: { name: string } }
  | { kind: "event"; event: "text_delta"; data: { text: string } }
  | { kind: "done"; data: DoneData }
  | { kind: "error"; data: { message: string; code?: string } };

export type DoneData = {
  toolCalls: string[];
  text: string;
  playbookChips: unknown;
  noteProposals: unknown;
  mutated: boolean;
};

type Subscriber = (e: AgentLiveEvent) => void;

class RunningTurnChannel {
  readonly turnId: string;
  private readonly buffer: AgentLiveEvent[] = [];
  private readonly subscribers = new Set<Subscriber>();
  private closed = false;

  constructor(turnId: string) {
    this.turnId = turnId;
  }

  publish(e: AgentLiveEvent): void {
    if (this.closed) return;
    this.buffer.push(e);
    for (const sub of this.subscribers) {
      try { sub(e); } catch { /* subscriber threw — ignore, it'll unsub */ }
    }
  }

  /** Replay buffered events to a new subscriber, then keep them subscribed
   * for live updates. Returns an unsubscribe function. */
  subscribe(sub: Subscriber): () => void {
    for (const e of this.buffer) {
      try { sub(e); } catch { /* swallow — caller will unsub */ }
    }
    if (this.closed) return () => {};
    this.subscribers.add(sub);
    return () => { this.subscribers.delete(sub); };
  }

  close(): void {
    this.closed = true;
    this.subscribers.clear();
  }

  isClosed(): boolean {
    return this.closed;
  }
}

const CHANNELS = new Map<string, RunningTurnChannel>();

/** Linger after close so a reconnect within this window can still replay
 * the final events (instead of having to fall back to DB polling). Short
 * enough that a process running for days doesn't accumulate detritus. */
const CHANNEL_LINGER_MS = 60_000;

export function createChannel(turnId: string): RunningTurnChannel {
  const ch = new RunningTurnChannel(turnId);
  CHANNELS.set(turnId, ch);
  return ch;
}

export function getChannel(turnId: string): RunningTurnChannel | null {
  return CHANNELS.get(turnId) ?? null;
}

export function disposeChannel(turnId: string): void {
  const ch = CHANNELS.get(turnId);
  if (!ch) return;
  ch.close();
  setTimeout(() => CHANNELS.delete(turnId), CHANNEL_LINGER_MS);
}

export type { RunningTurnChannel };
