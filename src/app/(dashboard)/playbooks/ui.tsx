"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { createPlaybookAction } from "@/app/actions/playbooks";
import { Button, Input, Card, EmptyState, useToast } from "@/components/ui";

type Row = { id: string; name: string; created_at: string | null };

export function PlaybooksClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [q, setQ] = useState("");

  const filtered = initial.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return p.name.toLowerCase().includes(s);
  });

  function create() {
    startTransition(async () => {
      const res = await createPlaybookAction(name || "New playbook");
      if (res.ok) {
        router.push(`/playbooks/${res.id}`);
        router.refresh();
      } else {
        toast(res.error, "error");
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
            placeholder="Search playbooks..."
          />
        </div>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playbook name"
            className="w-48"
          />
          <Button
            variant="primary"
            leftIcon={Plus}
            loading={pending}
            onClick={create}
          >
            Create
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          heading="No playbooks yet"
          description="Create your first playbook to start designing plays."
          action={
            <Button variant="primary" leftIcon={Plus} onClick={create} loading={pending}>
              Create playbook
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link key={p.id} href={`/playbooks/${p.id}`}>
              <Card hover className="p-5 transition-colors hover:border-primary/30">
                <h3 className="font-semibold text-foreground">{p.name}</h3>
                {p.created_at && (
                  <p className="mt-1 text-xs text-muted">
                    Created {new Date(p.created_at).toLocaleDateString()}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
