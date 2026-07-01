import type { CoachAiTurn } from "@/app/actions/coach-ai";
import { isContextDivider } from "./context-boundary";

/**
 * Merge the server-hydrated thread into the client's local turns.
 *
 * The server thread (coach_ai_turns) is authoritative for message CONTENT but
 * does NOT persist two client-owned things:
 *   1. context-divider marker turns (the play-scope "Earlier conversation"
 *      boundary — see context-boundary.ts), and
 *   2. save-defense / choice proposal chips + their saved state.
 *
 * The thread-hydration effect used to `setTurns(serverTurns)` outright, which
 * dropped both — so on a refresh the coach lost the "Earlier conversation"
 * collapse AND any "Added the defense to X" confirmation chip (surfaced
 * 2026-07-01: the chip vanished on refresh even though the attach persisted).
 *
 * This walks the client turns, keeps dividers in place, aligns real turns to the
 * server list in order (client = server + client-only dividers, same order), and
 * carries the client-only fields onto the matching server turn. Server turns the
 * client never cached (completed elsewhere) are appended; client turns not yet
 * persisted server-side are kept.
 */
export function reconcileServerTurns(
  serverTurns: CoachAiTurn[],
  clientTurns: CoachAiTurn[],
): CoachAiTurn[] {
  const result: CoachAiTurn[] = [];
  let si = 0;
  for (const ct of clientTurns) {
    if (isContextDivider(ct)) {
      result.push(ct); // client-only boundary marker — keep in position
      continue;
    }
    if (si < serverTurns.length) {
      result.push(carryClientOnlyFields(serverTurns[si], ct));
      si++;
    } else {
      // Server ran out but the client has more real turns not yet persisted.
      result.push(ct);
    }
  }
  // Server has turns the client never cached — append them verbatim.
  for (; si < serverTurns.length; si++) result.push(serverTurns[si]);
  return result;
}

/** Copy the client-only fields (proposal chips + their state) from the matching
 *  local turn onto the authoritative server turn. Content stays server-sourced. */
function carryClientOnlyFields(server: CoachAiTurn, client: CoachAiTurn): CoachAiTurn {
  if (server.role !== "assistant" || client.role !== "assistant") return server;
  const saveDefenseProposals = client.saveDefenseProposals ?? server.saveDefenseProposals ?? null;
  const saveDefenseProposalState =
    client.saveDefenseProposalState ?? server.saveDefenseProposalState ?? null;
  const choiceProposals = client.choiceProposals ?? server.choiceProposals ?? null;
  // Only spread a new object when there's something to carry — keeps referential
  // stability for turns without chips.
  if (!saveDefenseProposals && !saveDefenseProposalState && !choiceProposals) return server;
  return { ...server, saveDefenseProposals, saveDefenseProposalState, choiceProposals };
}
