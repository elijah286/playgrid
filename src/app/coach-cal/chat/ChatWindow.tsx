"use client";

import { Download, X } from "lucide-react";
import { CoachAiChat } from "@/features/coach-ai/CoachAiChat";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import type { CoachAiTurn } from "@/app/actions/coach-ai";
import { useCallback, useRef, useState } from "react";

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";

export function ChatWindow({
  playbookId,
  isAdmin,
  canDebugCal,
}: {
  playbookId: string | null;
  isAdmin: boolean;
  /** Site admin, or a non-admin account granted Cal debug tools. Gates the
   *  download-thread button below. */
  canDebugCal: boolean;
}) {
  const mode = "normal" as const;

  // Live thread mirror for the admin "download thread" debug affordance.
  const threadRef = useRef<CoachAiTurn[]>([]);
  const [threadLen, setThreadLen] = useState(0);
  const handleTurnsChange = useCallback((next: CoachAiTurn[]) => {
    threadRef.current = next;
    setThreadLen(next.length);
  }, []);

  // Builds a self-contained debugging document: a readable transcript (role,
  // tool calls, raw message text including ```play / ```spec fences) plus a
  // lossless JSON appendix carrying every field.
  const downloadThread = useCallback(() => {
    if (typeof window === "undefined") return;
    const turns = threadRef.current;
    if (turns.length === 0) return;

    const scope = playbookId ?? "global";
    const exportedAt = new Date().toISOString();
    const lines: string[] = [];

    lines.push("# Coach Cal thread export");
    lines.push("");
    lines.push(`- Exported: ${exportedAt}`);
    lines.push(`- Mode: ${mode}`);
    lines.push(`- Playbook ID: ${playbookId ?? "—"}`);
    lines.push(`- Scope: ${scope}`);
    lines.push(`- Turns: ${turns.length}`);
    lines.push(`- URL: ${window.location.href}`);
    lines.push(`- User agent: ${window.navigator.userAgent}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Transcript");

    turns.forEach((turn, i) => {
      lines.push("");
      lines.push(`### Turn ${i + 1} — ${turn.role.toUpperCase()}`);
      if (turn.role === "assistant") {
        const tools = turn.toolCalls && turn.toolCalls.length > 0 ? turn.toolCalls.join(", ") : "none";
        lines.push(`Tool calls: ${tools}`);
        const proposals: string[] = [];
        if (turn.playbookChips?.length) proposals.push(`${turn.playbookChips.length} playbook chip(s)`);
        if (turn.noteProposals?.length) proposals.push(`${turn.noteProposals.length} note proposal(s)`);
        if (turn.saveDefenseProposals?.length) proposals.push(`${turn.saveDefenseProposals.length} defense proposal(s)`);
        if (proposals.length) lines.push(`Proposals: ${proposals.join(", ")} (full detail in JSON appendix)`);
      }
      lines.push("");
      lines.push(turn.text && turn.text.length > 0 ? turn.text : "_(empty)_");
    });

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Raw JSON (lossless)");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(turns, null, 2));
    lines.push("```");
    lines.push("");

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coach-cal-thread-${scope}-${exportedAt.replace(/[:.]/g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [mode, playbookId]);

  return (
    <div className="fixed inset-0 flex flex-col bg-surface-raised text-foreground">
      {/* Header — mirrors the launcher's header chrome */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: GRADIENT }}
        >
          <CoachAiIcon className="size-5 text-primary" bare />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">Coach Cal</div>
          <div className="truncate text-[11px] leading-tight text-muted">
            Your AI coaching partner
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {canDebugCal && (
            <button
              type="button"
              onClick={downloadThread}
              disabled={threadLen === 0}
              className="rounded-md p-1.5 text-muted transition hover:bg-surface-inset hover:text-foreground disabled:opacity-30"
              title="Download thread (debug)"
              aria-label="Download thread for debugging"
            >
              <Download className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-md p-1.5 text-muted hover:bg-surface-inset hover:text-foreground transition"
            title="Close window"
            aria-label="Close window"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      {/* Chat surface fills remaining height */}
      <div className="flex-1 min-h-0">
        <CoachAiChat
          playbookId={playbookId}
          mode={mode}
          isAdmin={isAdmin}
          canDebugCal={canDebugCal}
          onTurnsChange={handleTurnsChange}
        />
      </div>
    </div>
  );
}
