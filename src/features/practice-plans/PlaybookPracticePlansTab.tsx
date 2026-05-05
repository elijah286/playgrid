"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Plus,
  Loader2,
  Clock,
  Layers,
  ClipboardList,
  Users,
  Repeat,
  CalendarRange,
} from "lucide-react";
import {
  createPracticePlanAction,
  deletePracticePlanAction,
  listPracticePlansAction,
  type PracticePlanRow,
} from "@/app/actions/practice-plans";
import { formatOffset } from "@/domain/practice-plan/types";
import { TeamCoachUpgradeDialog } from "@/features/upgrade/TeamCoachUpgradeDialog";
import { CoachCalCTA } from "@/features/coach-ai/CoachCalCTA";

export function PlaybookPracticePlansTab({
  playbookId,
  canUseTeamFeatures = true,
}: {
  playbookId: string;
  canUseTeamFeatures?: boolean;
}) {
  if (!canUseTeamFeatures) {
    return <PracticePlansUpgradePanel />;
  }
  return <PlaybookPracticePlansTabInner playbookId={playbookId} />;
}

function PracticePlansUpgradePanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4 pt-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Practice Plans</h2>
        <p className="text-sm text-muted">
          Reusable practice templates. Attach to a calendar event when you&apos;re ready.
        </p>
      </div>
      <div className="rounded-2xl border border-dashed border-border bg-surface-raised p-8 text-center">
        <div className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-brand-green text-white">
          <ClipboardList className="size-5" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          Practice plans are a Team Coach feature
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          Build reusable practice templates, collaborate with your co-coaches,
          and share the plan with your players.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          See Team Coach plan
        </button>
      </div>
      <TeamCoachUpgradeDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Practice plans are a Team Coach feature"
        intro="Walk into every practice with a plan. Build templates once, reuse them all season, and keep your staff and players on the same page."
        upgradeQuery="practice-plans"
        Icon={ClipboardList}
        bullets={[
          {
            Icon: Repeat,
            text: "Reusable templates with timed blocks and parallel station lanes — copy a plan, tweak the date, and you're set for next week.",
          },
          {
            Icon: Users,
            text: "Co-coaches with collaborator seats edit the same plan in real time. No more emailed PDFs.",
          },
          {
            Icon: CalendarRange,
            text: "Attach a plan to any calendar event so players know exactly what's running before they arrive.",
          },
        ]}
      />
    </div>
  );
}

function PlaybookPracticePlansTabInner({ playbookId }: { playbookId: string }) {
  const [plans, setPlans] = useState<PracticePlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function refresh() {
    setLoading(true);
    const res = await listPracticePlansAction(playbookId);
    if (res.ok) {
      setPlans(res.plans);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId]);

  function handleCreate() {
    const title = newTitle.trim();
    startCreate(async () => {
      const res = await createPracticePlanAction(playbookId, title);
      if (res.ok) {
        setNewTitle("");
        setShowCreate(false);
        // Open the new plan immediately.
        window.location.href = `/practice-plans/${res.planId}/edit`;
      } else {
        setError(res.error);
      }
    });
  }

  async function handleDelete(planId: string) {
    if (!confirm("Delete this practice plan?")) return;
    const res = await deletePracticePlanAction(planId);
    if (res.ok) refresh();
    else setError(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Practice Plans</h2>
          <p className="text-sm text-muted">
            Reusable practice templates. Attach to a calendar event when you&apos;re ready.
          </p>
        </div>
        {!showCreate ? (
          <div className="flex items-center gap-2">
            <CoachCalCTA entryPoint="playbook_generate_practice_plan" />
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New plan
            </button>
          </div>
        ) : null}
      </div>

      {showCreate && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Plan title
          </label>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Tier-2 In-Season Tuesday"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setShowCreate(false);
                setNewTitle("");
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setNewTitle("");
              }}
              className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-inset"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-4 py-12 text-center">
          <p className="text-sm text-muted">
            No practice plans yet. Create one to start building your practice templates.
          </p>
          <CoachCalCTA
            entryPoint="playbook_generate_practice_plan"
            variant="primary"
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 hover:border-primary/40"
            >
              <Link
                href={`/practice-plans/${plan.id}/edit`}
                className="min-w-0 flex-1"
              >
                <div className="truncate text-sm font-semibold">{plan.title}</div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatOffset(plan.total_duration_minutes)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {plan.block_count} block{plan.block_count === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(plan.id)}
                className="rounded-md px-2 py-1 text-xs text-muted opacity-0 transition-opacity hover:bg-surface-inset hover:text-destructive group-hover:opacity-100"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
