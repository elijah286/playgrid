/**
 * Eval runner — drive runAgent against a scenario, capture the result,
 * run assertions.
 *
 * Real Claude API calls — set ANTHROPIC_API_KEY in .env.local. Each
 * scenario typically costs 5-15 cents and takes 5-30 seconds.
 *
 * The runner instruments the agent loop by:
 *  - Building a hermetic ToolContext (no DB).
 *  - Wrapping `chat` / `runTool` via an event stream callback to capture
 *    tool calls + the final text.
 *  - Parsing ```play / ```spec fences out of the captured text.
 *  - Running every assertion in the scenario's list.
 *
 * Returns a ScenarioRunResult: ok=true iff every assertion passed.
 */

import { runAgent } from "@/lib/coach-ai/agent";
import type { ChatMessage } from "@/lib/coach-ai/llm";
import type { AgentStreamEvent } from "@/lib/coach-ai/agent";
import type { RunCapture, Scenario, ScenarioRunResult } from "./types";
import { buildEvalContext } from "./context";

/** Tools that MUTATE production data. The runner refuses to proceed
 *  past a scenario where Cal tries to call one of these — evals run
 *  against the real Supabase project and a stray save would land
 *  in production. Phase 4 MVP scenarios test read paths only
 *  (compose_play, compose_defense, search_kb). If a future scenario
 *  legitimately needs a write tool, the right answer is a test
 *  fixture playbook OR a mockable Supabase client, not loosening
 *  this guard.
 *
 *  The eval can still inspect what args Cal WOULD have called these
 *  with — we surface that in the capture so assertions can verify
 *  "Cal correctly TRIED to save" without actually saving. */
const FORBIDDEN_WRITE_TOOLS = new Set([
  "create_play",
  "update_play",
  "rename_play",
  "update_play_notes",
  "create_playbook",
  "create_play_group",
  "rename_play_group",
  "delete_play_group",
  "assign_plays_to_group",
  "create_practice_plan",
  "create_event",
  "update_event",
  "cancel_event",
  "rsvp_event",
  "add_kb_entry",
  "edit_kb_entry",
  "retire_kb_entry",
  "enable_playbook_capability",
  "set_user_preference",
]);

/** Run one scenario. */
export async function runScenario(scenario: Scenario): Promise<ScenarioRunResult> {
  const ctx = buildEvalContext(scenario.context);

  // Translate the scenario's plain ChatTurn[] into the ChatMessage shape
  // the agent expects. The agent treats every entry's `content` as a
  // string for simple text turns.
  const history: ChatMessage[] = scenario.chat.map((t) => ({
    role: t.role,
    content: t.text,
  }));

  // Capture: every tool call (name + args) the agent makes, plus the
  // final text emitted via text_delta events.
  const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const textParts: string[] = [];

  const onEvent = (e: AgentStreamEvent) => {
    if (e.type === "tool_call") {
      // The "tool_call" event only carries the name. Args land later
      // via message-level inspection — see the result's `newMessages`.
      // We seed the tool-name list here so we can verify order even
      // without args.
      toolCalls.push({ name: e.name, input: {} });
    } else if (e.type === "text_delta") {
      textParts.push(e.text);
    }
  };

  const start = Date.now();
  let assistantText = "";
  let error: string | undefined;
  let result: Awaited<ReturnType<typeof runAgent>> | undefined;
  try {
    result = await runAgent(history, ctx, onEvent);
    assistantText = textParts.join("");
    // Fallback: if no text_delta events fired (some agent paths emit
    // the text via newMessages instead), reconstruct from the last
    // assistant message.
    if (!assistantText && result.newMessages.length > 0) {
      const last = result.newMessages[result.newMessages.length - 1];
      if (last.role === "assistant") {
        if (typeof last.content === "string") {
          assistantText = last.content;
        } else {
          assistantText = last.content
            .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
            .map((b) => b.text)
            .join("\n");
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const durationMs = Date.now() - start;

  // After-the-fact tool-arg recovery: walk result.newMessages for
  // assistant turns and extract tool_use blocks. The onEvent path
  // only had names; here we get the full input. We match by ORDER
  // (same number of tool calls in the same sequence).
  if (result) {
    const allToolUses: Array<{ name: string; input: Record<string, unknown> }> = [];
    for (const msg of result.newMessages) {
      if (msg.role !== "assistant" || typeof msg.content === "string") continue;
      for (const block of msg.content) {
        if (block.type === "tool_use") {
          allToolUses.push({
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }
    }
    // Replace the onEvent-built list with the richer one.
    toolCalls.length = 0;
    toolCalls.push(...allToolUses);
  }

  // Parse ```play and ```spec blocks out of the final text.
  const playFences = extractJsonFences(assistantText, "play");
  const specBlocks = extractJsonFences(assistantText, "spec");

  const capture: RunCapture = {
    toolCalls,
    assistantText,
    playFences,
    specBlocks,
    durationMs,
  };

  // Production-DB-safety: if Cal called any tool in FORBIDDEN_WRITE_TOOLS
  // we report it as a hard failure with explicit guidance. (Note: by
  // this point the tool's handler has likely already run — the guard
  // catches the call and converts to a failure, but we can't prevent
  // the side effect post-hoc. The real defense is restricting eval
  // scenarios to read paths; this guard surfaces the violation.)
  const usedWriteTools = toolCalls
    .map((c) => c.name)
    .filter((n) => FORBIDDEN_WRITE_TOOLS.has(n));
  if (usedWriteTools.length > 0) {
    return {
      scenario,
      ok: false,
      assertions: [],
      capture,
      error:
        `Scenario "${scenario.name}" triggered write tool(s): ${usedWriteTools.join(", ")}. ` +
        `Phase 4 MVP scenarios run against production Supabase; this would pollute production data. ` +
        `Either rewrite the scenario to test the read path, or build a test-fixture playbook before running this.`,
    };
  }

  // Run assertions. A crash counts as ok:false with the error
  // surfaced; the assertions list is empty in that case.
  if (error) {
    return {
      scenario,
      ok: false,
      assertions: [],
      capture,
      error,
    };
  }

  const assertions = scenario.assertions.map((a) => {
    try {
      return a(capture);
    } catch (e) {
      return {
        ok: false as const,
        description: "assertion threw",
        details: e instanceof Error ? e.message : String(e),
      };
    }
  });
  const ok = assertions.every((r) => r.ok);

  return {
    scenario,
    ok,
    assertions,
    capture,
  };
}

/** Extract every ```<kind> ... ``` block from the text and try to
 *  parse each as JSON. Skips unparseable blocks silently — assertions
 *  on shape will fail more informatively if the JSON's malformed. */
function extractJsonFences(text: string, kind: "play" | "spec"): Array<Record<string, unknown>> {
  const re = new RegExp("```" + kind + "\\s*\\n([\\s\\S]*?)\\n```", "g");
  const out: Array<Record<string, unknown>> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim()) as Record<string, unknown>;
      out.push(parsed);
    } catch {
      // Skip — the fence is malformed. The relevant assertion will
      // report a shape mismatch rather than the parse error.
    }
  }
  return out;
}
