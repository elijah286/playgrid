// Foundation for "Leo", the league-operator AI assistant. Leo is a PARALLEL
// agent to Coach Cal: it reuses Cal's low-level primitives (the ToolDef shape,
// the chat() LLM seam, searchKb, the approval-chip pattern) but keeps its own
// tool registry, system prompt, and runner so the coach product is never
// touched.
//
// The load-bearing convention (see AGENTS.md "League AI-readiness"): every
// league capability registers its tools + knowledge here IN LOCKSTEP as it's
// built. Reads are free; consequential writes are marked `consequential` and
// must go through human approval (the chip pattern) — never silent.

import type { ToolDef } from "@/lib/coach-ai/llm";
import type { Capability } from "@/lib/league/access-control";

/** Resolved per request, AFTER the chat route has authorized the operator for
 *  this league. Tool handlers may therefore act within this league's scope. */
export type LeagueToolContext = {
  leagueId: string;
  userId: string;
  /** operator/league_admin (can approve consequential writes) vs read-only roles. */
  isLeagueAdmin: boolean;
  /** For a delegated member (not an admin): the capabilities they hold on this
   *  league. Owners have isLeagueAdmin=true and bypass this. */
  capabilities: Capability[];
};

export type LeagueToolResult =
  | { ok: true; result: string }
  | { ok: false; error: string };

export type LeagueToolHandler = (
  input: Record<string, unknown>,
  ctx: LeagueToolContext,
) => Promise<LeagueToolResult>;

export type LeagueTool = {
  def: ToolDef;
  /**
   * "read" — pure read, always allowed, no approval.
   * "consequential" — a write/side-effect. Leo PROPOSES it; a human approves
   * via a chip before it commits. The handler of a consequential tool should
   * produce a proposal/preview, not perform the write directly.
   */
  kind: "read" | "consequential";
  handler: LeagueToolHandler;
};
