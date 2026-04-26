"use client";

import { useState, useTransition } from "react";
import { Card, SegmentedControl, useToast } from "@/components/ui";
import { setLlmProviderAction } from "@/app/actions/admin-integrations";
import type { LlmProvider } from "@/lib/site/llm-provider";

const OPTIONS: { value: LlmProvider; label: string }[] = [
  { value: "claude", label: "Claude" },
  { value: "openai", label: "OpenAI" },
];

export function LlmProviderToggleClient({ initial }: { initial: LlmProvider }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<LlmProvider>(initial);
  const [, startTransition] = useTransition();

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Coach AI provider</h3>
          <p className="mt-0.5 text-xs text-muted">
            Picks which model answers Coach AI chat. Embeddings always use OpenAI.
          </p>
        </div>
        <SegmentedControl
          value={provider}
          onChange={(next) => {
            const prev = provider;
            setProvider(next);
            startTransition(async () => {
              const res = await setLlmProviderAction(next);
              if (!res.ok) {
                setProvider(prev);
                toast(res.error, "error");
                return;
              }
              toast(`Provider set to ${next === "claude" ? "Claude" : "OpenAI"}.`, "success");
            });
          }}
          options={OPTIONS}
        />
      </div>
    </Card>
  );
}
