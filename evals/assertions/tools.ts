/**
 * Assertions that inspect Cal's tool-call sequence.
 *
 * Examples:
 *   toolCalled("compose_play")
 *   toolCalled("compose_defense", { on_play: expect.any(String) })
 *   toolNotCalled("compose_play")  // anti-pattern: must not call
 *   toolCallCount("compose_play", { max: 3 })
 */

import type { Assertion } from "../types";

/** Cal must have called the named tool at least once. */
export function toolCalled(name: string, argsMatcher?: (input: Record<string, unknown>) => boolean): Assertion {
  return (cap) => {
    const matches = cap.toolCalls.filter((c) => c.name === name);
    if (matches.length === 0) {
      return {
        ok: false,
        description: `tool ${name} should have been called`,
        details: `actually called: ${cap.toolCalls.map((c) => c.name).join(", ") || "(none)"}`,
      };
    }
    if (argsMatcher) {
      const argMatch = matches.some((m) => {
        try {
          return argsMatcher(m.input);
        } catch {
          return false;
        }
      });
      if (!argMatch) {
        return {
          ok: false,
          description: `tool ${name} should have been called with matching args`,
          details: `called with: ${matches.map((m) => JSON.stringify(m.input)).join(" | ")}`,
        };
      }
    }
    return { ok: true, description: `tool ${name} was called` };
  };
}

/** Cal must NOT have called the named tool. */
export function toolNotCalled(name: string): Assertion {
  return (cap) => {
    const count = cap.toolCalls.filter((c) => c.name === name).length;
    if (count > 0) {
      return {
        ok: false,
        description: `tool ${name} should NOT have been called`,
        details: `but it was called ${count} time(s)`,
      };
    }
    return { ok: true, description: `tool ${name} was correctly not called` };
  };
}

/** Cal must have called the tool within [min, max] times. */
export function toolCallCount(
  name: string,
  bounds: { min?: number; max?: number; exact?: number },
): Assertion {
  return (cap) => {
    const count = cap.toolCalls.filter((c) => c.name === name).length;
    if (bounds.exact !== undefined && count !== bounds.exact) {
      return {
        ok: false,
        description: `tool ${name} must be called exactly ${bounds.exact} time(s)`,
        details: `actual count: ${count}`,
      };
    }
    if (bounds.min !== undefined && count < bounds.min) {
      return {
        ok: false,
        description: `tool ${name} must be called at least ${bounds.min} time(s)`,
        details: `actual count: ${count}`,
      };
    }
    if (bounds.max !== undefined && count > bounds.max) {
      return {
        ok: false,
        description: `tool ${name} must be called at most ${bounds.max} time(s)`,
        details: `actual count: ${count}`,
      };
    }
    return { ok: true, description: `tool ${name} call count = ${count}` };
  };
}
