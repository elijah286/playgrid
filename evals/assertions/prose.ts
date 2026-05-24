/**
 * Assertions on Cal's prose (the assistant text outside any code fence).
 *
 * Examples:
 *   proseContains(/save this play/i)
 *   proseAvoids(/x=-?\d+\s*,\s*y=-?\d+/)    // no raw coordinate tuples
 *   proseAvoids(/call `\w+` to/)             // no tool-name leaks
 */

import type { Assertion } from "../types";

/** Strip ```...``` fenced blocks from the assistant text so prose-only
 *  assertions don't false-positive on JSON inside fences. */
function stripFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

/** Cal's prose must match the regex. */
export function proseContains(re: RegExp): Assertion {
  return (cap) => {
    const prose = stripFences(cap.assistantText);
    if (!re.test(prose)) {
      return {
        ok: false,
        description: `prose must contain ${re}`,
        details: `prose: ${prose.slice(0, 200)}...`,
      };
    }
    return { ok: true, description: `prose contains ${re}` };
  };
}

/** Cal's prose must NOT match the regex. Used for anti-patterns like
 *  raw coordinate exposure ("x=-10, y=5"), tool-name leaks, or
 *  apology-on-validator-retry phrasings. */
export function proseAvoids(re: RegExp, label?: string): Assertion {
  return (cap) => {
    const prose = stripFences(cap.assistantText);
    const m = prose.match(re);
    if (m) {
      return {
        ok: false,
        description: `prose must NOT contain ${label ?? re}`,
        details: `matched: "${m[0]}" at offset ${m.index ?? "?"}`,
      };
    }
    return { ok: true, description: `prose correctly avoids ${label ?? re}` };
  };
}

/** Cal's prose must reference the player by @-token (e.g. "@X"), not
 *  the bare label. Catches the "CB stays on the line" → should be
 *  "@CB stays on the line" regression class. */
export function proseUsesAtTokenFor(playerId: string): Assertion {
  return (cap) => {
    const prose = stripFences(cap.assistantText);
    const atRe = new RegExp(`@${playerId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`);
    if (!atRe.test(prose)) {
      return {
        ok: false,
        description: `prose must reference @${playerId} with @-token`,
        details: prose.includes(playerId)
          ? `mentions "${playerId}" but without @-prefix`
          : `does not mention ${playerId} at all`,
      };
    }
    return { ok: true, description: `prose uses @${playerId}` };
  };
}
