"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPlaybookAction } from "@/app/actions/playbooks";

type Row = { id: string; name: string; created_at: string | null };

export function PlaybooksClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function create() {
    startTransition(async () => {
      const res = await createPlaybookAction(name || "New playbook");
      if (res.ok) {
        router.push(`/playbooks/${res.id}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New playbook name"
          className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={create}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Create playbook
        </button>
      </div>
      <ul className="divide-y divide-slate-200/80 rounded-2xl bg-white ring-1 ring-slate-200/80">
        {initial.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">No playbooks yet.</li>
        )}
        {initial.map((p) => (
          <li key={p.id}>
            <Link
              href={`/playbooks/${p.id}`}
              className="flex items-center justify-between px-4 py-4 hover:bg-slate-50/80"
            >
              <span className="font-medium text-slate-900">{p.name}</span>
              <span className="text-xs text-slate-400">Open</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
