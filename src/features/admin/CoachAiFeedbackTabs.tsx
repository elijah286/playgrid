"use client";

import { useState } from "react";
import type { KbMissRow } from "@/app/actions/coach-ai-feedback";
import { CoachAiFeedbackAdminClient } from "./CoachAiFeedbackAdminClient";
import { CoachAiClustersClient } from "./CoachAiClustersClient";
import { CoachAiTrendsClient } from "./CoachAiTrendsClient";
import { CoachAiKbHistoryClient } from "./CoachAiKbHistoryClient";

type Sub = "inbox" | "clusters" | "trends" | "history";

export function CoachAiFeedbackTabs({
  initialKbMisses,
  initialError,
}: {
  initialKbMisses: KbMissRow[];
  initialError: string | null;
}) {
  const [sub, setSub] = useState<Sub>("inbox");

  const tabs: { value: Sub; label: string; hint: string }[] = [
    { value: "inbox", label: "Inbox", hint: "Raw failure signals from coaches." },
    { value: "clusters", label: "Clusters", hint: "LLM-drafted KB chunks awaiting your approval." },
    { value: "trends", label: "Trends", hint: "Failure rates and top topics over time." },
    { value: "history", label: "KB history", hint: "Recent KB writes; revert any one." },
  ];
  const active = tabs.find((t) => t.value === sub) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface-raised p-4 ring-1 ring-black/5">
        <h2 className="text-base font-semibold text-foreground">AI Feedback</h2>
        <p className="mt-1 text-sm text-muted">{active.hint}</p>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-inset p-0.5 text-xs">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setSub(t.value)}
            className={`rounded px-3 py-1.5 ${
              sub === t.value
                ? "bg-surface-raised font-semibold text-foreground shadow"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "inbox" && (
        <CoachAiFeedbackAdminClient initialItems={initialKbMisses} initialError={initialError} />
      )}
      {sub === "clusters" && <CoachAiClustersClient />}
      {sub === "trends" && <CoachAiTrendsClient />}
      {sub === "history" && <CoachAiKbHistoryClient />}
    </div>
  );
}
