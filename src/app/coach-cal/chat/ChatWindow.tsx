"use client";

import { GraduationCap, X } from "lucide-react";
import { CoachAiChat } from "@/features/coach-ai/CoachAiChat";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import { cn } from "@/lib/utils";
import { useState } from "react";

const GRADIENT = "linear-gradient(135deg, #dbeafe 0%, #ede9fe 100%)";

export function ChatWindow({
  playbookId,
  isAdmin,
}: {
  playbookId: string | null;
  isAdmin: boolean;
}) {
  const [adminMode, setAdminMode] = useState(false);
  const adminTrainingActive = isAdmin && adminMode;
  const mode: "normal" | "admin_training" = adminTrainingActive ? "admin_training" : "normal";

  return (
    <div className="fixed inset-0 flex flex-col bg-surface-raised text-foreground">
      {/* Header — mirrors the launcher's header chrome */}
      <header
        className={cn(
          "flex shrink-0 items-center gap-2 border-b px-3 py-2",
          adminTrainingActive
            ? "border-amber-300 bg-amber-50/60"
            : "border-border",
        )}
      >
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: GRADIENT }}
        >
          <CoachAiIcon className="size-5 text-primary" bare />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            Coach Cal
            {adminTrainingActive && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 ring-1 ring-amber-300">
                <GraduationCap className="size-3" /> Training
              </span>
            )}
          </div>
          <div className="truncate text-[11px] leading-tight text-muted">
            {adminTrainingActive
              ? "Curating the global knowledge base"
              : "Your AI coaching partner"}
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setAdminMode((v) => !v)}
              aria-pressed={adminTrainingActive}
              className={cn(
                "rounded-md p-1.5 transition",
                adminTrainingActive
                  ? "bg-amber-500/20 text-amber-800 hover:bg-amber-500/30"
                  : "text-muted hover:bg-surface-inset hover:text-foreground",
              )}
              title={adminTrainingActive ? "Exit admin training" : "Admin training"}
            >
              <GraduationCap className="size-4" />
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
        <CoachAiChat playbookId={playbookId} mode={mode} />
      </div>
    </div>
  );
}
