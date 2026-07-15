"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Monitor } from "lucide-react";
import type { PlayDocument } from "@/domain/play/types";
import { Button, Input } from "@/components/ui";
import { PlayDocRender } from "@/features/coach-ai/PlayDiagramEmbed";

type PlayRow = {
  id: string;
  name: string;
  wristband_code: string | null;
  shorthand: string | null;
};

type Props = {
  plays: PlayRow[];
  currentId: string;
  document: PlayDocument;
  playbookId: string;
};

export function PlayCarousel({ plays, currentId, document, playbookId }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return plays;
    return plays.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.wristband_code && p.wristband_code.toLowerCase().includes(s)) ||
        (p.shorthand && p.shorthand.toLowerCase().includes(s)),
    );
  }, [plays, q]);

  const idx = plays.findIndex((p) => p.id === currentId);
  const prev = idx > 0 ? plays[idx - 1] : null;
  const next = idx >= 0 && idx < plays.length - 1 ? plays[idx + 1] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Input
        leftIcon={Search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search code or name"
      />

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-surface-raised p-2">
        <ul className="space-y-1">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/m/play/${p.id}?playbookId=${playbookId}`}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  p.id === currentId
                    ? "bg-primary text-white font-medium"
                    : "hover:bg-surface-inset text-foreground"
                }`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="opacity-70 text-xs">{p.wristband_code}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Button
          variant="secondary"
          leftIcon={ChevronLeft}
          disabled={!prev}
          onClick={() => prev && router.push(`/m/play/${prev.id}?playbookId=${playbookId}`)}
          className="justify-center"
        >
          Prev
        </Button>
        <div className="w-full max-w-[320px] justify-self-center">
          <PlayDocRender doc={document} />
        </div>
        <Button
          variant="secondary"
          rightIcon={ChevronRight}
          disabled={!next}
          onClick={() => next && router.push(`/m/play/${next.id}?playbookId=${playbookId}`)}
          className="justify-center"
        >
          Next
        </Button>
      </div>

      <Link href={`/plays/${currentId}/edit`} className="block">
        <Button variant="primary" leftIcon={Monitor} className="w-full justify-center">
          Edit on desktop
        </Button>
      </Link>
    </div>
  );
}
