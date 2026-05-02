"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import {
  approveFeedbackClusterAction,
  listFeedbackClustersAction,
  refreshFeedbackClustersAction,
  rejectFeedbackClusterAction,
  type ClusterRow,
} from "@/app/actions/coach-ai-clusters";

const TOPIC_OPTIONS: ClusterRow["suggested_topic"][] = [
  "rules",
  "scheme",
  "terminology",
  "tactics",
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CoachAiClustersClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<ClusterRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [loading, startLoad] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [acting, startAct] = useTransition();
  const [edits, setEdits] = useState<Record<string, Partial<ClusterRow>>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    load(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(s: "pending" | "all" = statusFilter) {
    startLoad(async () => {
      const res = await listFeedbackClustersAction(s);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setErr(null);
      setItems(res.items);
    });
  }

  function refresh() {
    startRefresh(async () => {
      const res = await refreshFeedbackClustersAction();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast(
        `Considered ${res.signalsConsidered} signals · drafted ${res.clustersDrafted} cluster${res.clustersDrafted === 1 ? "" : "s"}.`,
        "success",
      );
      load();
    });
  }

  function setEdit(id: string, patch: Partial<ClusterRow>) {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }

  function approve(c: ClusterRow) {
    if (!window.confirm(`Approve and publish "${(edits[c.id]?.draft_title ?? c.draft_title).trim()}" to the global KB?`)) return;
    startAct(async () => {
      const e = edits[c.id] ?? {};
      const res = await approveFeedbackClusterAction(c.id, {
        draft_title: e.draft_title,
        draft_content: e.draft_content,
        draft_subtopic: e.draft_subtopic,
        suggested_topic: e.suggested_topic,
        suggested_sport_variant: e.suggested_sport_variant,
        suggested_game_level: e.suggested_game_level,
        suggested_sanctioning_body: e.suggested_sanctioning_body,
        suggested_age_division: e.suggested_age_division,
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Published to KB.", "success");
      load();
    });
  }

  function reject(c: ClusterRow) {
    const reason = window.prompt("Optional reason for rejecting (helps the suggester learn what not to draft):");
    if (reason === null) return;
    startAct(async () => {
      const res = await rejectFeedbackClusterAction(c.id, reason || null);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      load();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-surface-inset p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("pending");
              load("pending");
            }}
            className={`rounded px-3 py-1 ${statusFilter === "pending" ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              load("all");
            }}
            className={`rounded px-3 py-1 ${statusFilter === "all" ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
          >
            All
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className="mr-1 size-3.5" />
          Reload
        </Button>
        <Button variant="primary" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`mr-1 size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Clustering…" : "Refresh clusters"}
        </Button>
        <span className="ml-auto text-xs text-muted">{items.length} clusters</span>
      </div>

      {err && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      )}

      {items.length === 0 && !loading ? (
        <p className="rounded-lg bg-surface-inset px-3 py-6 text-center text-sm text-muted">
          {statusFilter === "pending"
            ? "No pending clusters. Click \"Refresh clusters\" to scan recent failure signals."
            : "No clusters yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => {
            const e = edits[c.id] ?? {};
            const isPending = c.status === "pending";
            return (
              <li
                key={c.id}
                className={`rounded-xl bg-surface-raised p-4 ring-1 ring-black/5 ${
                  isPending ? "" : "opacity-70"
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded px-2 py-0.5 font-semibold ${
                    isPending
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      : c.status === "approved"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                        : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}>
                    {c.status}
                  </span>
                  <span className="text-muted">cluster size: {c.cluster_size}</span>
                  <span className="text-muted">·</span>
                  <span className="text-muted">
                    KB miss {c.signal_kb_miss} · refusal {c.signal_refusal} · 👎 {c.signal_thumbs_dn}
                  </span>
                  <span className="ml-auto text-muted">{formatDate(c.created_at)}</span>
                </div>

                {isPending ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-muted">Title</label>
                      <Input
                        value={e.draft_title ?? c.draft_title}
                        onChange={(ev) => setEdit(c.id, { draft_title: ev.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted">KB content</label>
                      <textarea
                        value={e.draft_content ?? c.draft_content}
                        onChange={(ev) => setEdit(c.id, { draft_content: ev.target.value })}
                        rows={6}
                        className="mt-1 w-full rounded-lg bg-surface-inset px-3 py-2 text-sm text-foreground ring-1 ring-inset ring-black/5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <FacetSelect
                        label="Topic"
                        value={(e.suggested_topic ?? c.suggested_topic) as string}
                        options={TOPIC_OPTIONS}
                        onChange={(v) => setEdit(c.id, { suggested_topic: v as ClusterRow["suggested_topic"] })}
                      />
                      <FacetInput
                        label="Subtopic (optional)"
                        value={e.draft_subtopic ?? c.draft_subtopic ?? ""}
                        onChange={(v) => setEdit(c.id, { draft_subtopic: v || null })}
                      />
                      <FacetInput
                        label="Sport variant"
                        value={e.suggested_sport_variant ?? c.suggested_sport_variant ?? ""}
                        onChange={(v) => setEdit(c.id, { suggested_sport_variant: v || null })}
                      />
                      <FacetInput
                        label="Sanctioning body"
                        value={e.suggested_sanctioning_body ?? c.suggested_sanctioning_body ?? ""}
                        onChange={(v) => setEdit(c.id, { suggested_sanctioning_body: v || null })}
                      />
                      <FacetInput
                        label="Game level"
                        value={e.suggested_game_level ?? c.suggested_game_level ?? ""}
                        onChange={(v) => setEdit(c.id, { suggested_game_level: v || null })}
                      />
                      <FacetInput
                        label="Age division"
                        value={e.suggested_age_division ?? c.suggested_age_division ?? ""}
                        onChange={(v) => setEdit(c.id, { suggested_age_division: v || null })}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-foreground">{c.draft_title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">
                      {c.draft_content}
                    </p>
                    {c.status === "rejected" && c.rejection_reason && (
                      <p className="mt-2 text-xs italic text-muted">Rejected: {c.rejection_reason}</p>
                    )}
                  </div>
                )}

                {c.sample_prompts.length > 0 && (
                  <div className="mt-3 rounded-lg bg-surface-inset p-2">
                    <p className="text-xs font-medium text-muted">Sample prompts</p>
                    <ul className="mt-1 space-y-1 text-xs text-foreground/80">
                      {c.sample_prompts.map((p, i) => (
                        <li key={i}>&ldquo;{p}&rdquo;</li>
                      ))}
                    </ul>
                  </div>
                )}

                {isPending && (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => reject(c)} disabled={acting}>
                      <X className="mr-1 size-3.5" />
                      Reject
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => approve(c)} disabled={acting}>
                      <Check className="mr-1 size-3.5" />
                      Approve & publish
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FacetInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg bg-surface-inset px-3 py-2 text-sm text-foreground ring-1 ring-inset ring-black/5 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
