"use client";

import { useEffect, useState, useTransition } from "react";
import { Database } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";
import {
  backfillRagEmbeddingsAction,
  ragEmbeddingStatsAction,
} from "@/app/actions/coach-ai";

export function RagEmbeddingsAdminClient() {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [total, setTotal] = useState<number | null>(null);
  const [missing, setMissing] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  function refresh() {
    startTransition(async () => {
      const res = await ragEmbeddingStatsAction();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setTotal(res.total);
      setMissing(res.missing);
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBackfill() {
    if (running) return;
    setRunning(true);
    try {
      let totalEmbedded = 0;
      // Loop until no rows remain or an error fires.
      // Each call processes up to 50 rows.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await backfillRagEmbeddingsAction();
        if (!res.ok) {
          toast(res.error, "error");
          break;
        }
        totalEmbedded += res.embedded;
        setMissing(res.remaining);
        if (res.remaining === 0 || res.embedded === 0) break;
      }
      toast(`Embedded ${totalEmbedded} entries.`, "success");
    } finally {
      setRunning(false);
      refresh();
    }
  }

  const status =
    total === null
      ? "Loading…"
      : missing === 0
        ? `All ${total} entries embedded.`
        : `${missing} of ${total} entries need embedding.`;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Database className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Coach AI knowledge base
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Embeddings make new entries searchable. Run after importing seed
              SQL or if Coach AI ever misses content you know was added.
              {" "}<span className="text-foreground/80">{status}</span>
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={runBackfill}
          disabled={pending || running || missing === 0}
          loading={running}
        >
          {running ? "Embedding…" : "Backfill embeddings"}
        </Button>
      </div>
    </Card>
  );
}
