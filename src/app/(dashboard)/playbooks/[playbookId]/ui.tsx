"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Search, Pencil, Smartphone, FileText } from "lucide-react";
import { createPlayAction } from "@/app/actions/plays";
import { Button, Input, Card, Badge, EmptyState } from "@/components/ui";

type PlayRow = {
  id: string;
  name: string;
  wristband_code: string | null;
  shorthand: string | null;
  concept: string | null;
  updated_at: string | null;
};

export function PlaybookDetailClient({
  playbookId,
  initialPlays,
}: {
  playbookId: string;
  initialPlays: PlayRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");

  const filtered = initialPlays.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      p.name.toLowerCase().includes(s) ||
      (p.wristband_code && p.wristband_code.toLowerCase().includes(s)) ||
      (p.shorthand && p.shorthand.toLowerCase().includes(s)) ||
      (p.concept && p.concept.toLowerCase().includes(s))
    );
  });

  function addPlay() {
    startTransition(async () => {
      const res = await createPlayAction(playbookId);
      if (res.ok) {
        router.push(`/plays/${res.playId}/edit`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Input
            leftIcon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by code, name, or concept..."
          />
        </div>
        <Button
          variant="primary"
          leftIcon={Plus}
          loading={pending}
          onClick={addPlay}
        >
          New play
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          heading="No plays yet"
          description="Create your first play to start designing routes and formations."
          action={
            <Button variant="primary" leftIcon={Plus} onClick={addPlay} loading={pending}>
              New play
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} hover className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground">{p.name}</h3>
                  {p.wristband_code && (
                    <Badge variant="primary">{p.wristband_code}</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {p.concept || p.shorthand || "No concept set"}
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <Link href={`/plays/${p.id}/edit`} className="flex-1">
                  <Button variant="primary" size="sm" leftIcon={Pencil} className="w-full">
                    Edit
                  </Button>
                </Link>
                <Link href={`/m/play/${p.id}?playbookId=${playbookId}`}>
                  <Button variant="secondary" size="sm" leftIcon={Smartphone}>
                    Mobile
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
